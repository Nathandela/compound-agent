//! ca-embed: Embedding daemon for compound-agent.
//!
//! Loads nomic-embed-text-v1.5 ONNX Q8 model once, serves embedding requests
//! via Unix domain socket using JSON-lines protocol.
//!
//! Lifecycle: auto-started by Go CLI, exits after 5 minutes idle or on SIGTERM.
//! Concurrent connections supported via OS threads.

use ort::session::Session;
use ort::value::Tensor;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use std::{env, fs, process, thread};
use tokenizers::Tokenizer;

// --- Protocol types ---

#[derive(Deserialize)]
struct Request {
    id: Option<String>,
    method: String,
    texts: Option<Vec<String>>,
}

#[derive(Serialize)]
struct EmbedResponse {
    id: String,
    vectors: Vec<Vec<f32>>,
}

#[derive(Serialize)]
struct HealthResponse {
    id: String,
    status: String,
    model: String,
}

#[derive(Serialize)]
struct ErrorResponse {
    id: String,
    error: String,
}

#[derive(Serialize)]
struct ShutdownResponse {
    id: String,
    status: String,
}

// --- Error types ---

#[derive(Debug, thiserror::Error)]
enum DaemonError {
    #[error("tokenize: {0}")]
    Tokenize(String),
    #[error("tensor: {0}")]
    Tensor(#[from] ort::Error),
    #[error("inference: {0}")]
    Inference(String),
    #[error("extract: {0}")]
    Extract(String),
    #[error("write PID file: {0}")]
    PidFile(#[from] std::io::Error),
}

// --- Inference ---

fn mean_pool(
    token_embeddings: &[f32],
    attention_mask: &[i64],
    seq_len: usize,
    hidden_dim: usize,
) -> Vec<f32> {
    let mut pooled = vec![0.0f32; hidden_dim];
    let mut mask_sum: f32 = 0.0;

    for i in 0..seq_len {
        let mask_val = attention_mask[i] as f32;
        if mask_val > 0.0 {
            for j in 0..hidden_dim {
                pooled[j] += token_embeddings[i * hidden_dim + j] * mask_val;
            }
            mask_sum += mask_val;
        }
    }

    if mask_sum > 0.0 {
        for v in pooled.iter_mut() {
            *v /= mask_sum;
        }
    }

    pooled
}

fn l2_normalize(v: &mut [f32]) {
    let magnitude: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if magnitude > 0.0 {
        for val in v.iter_mut() {
            *val /= magnitude;
        }
    }
}

fn embed_texts(
    session: &mut Session,
    tokenizer: &Tokenizer,
    texts: &[String],
) -> Result<Vec<Vec<f32>>, DaemonError> {
    let mut results = Vec::with_capacity(texts.len());

    for text in texts {
        let encoding = tokenizer
            .encode(text.as_str(), true)
            .map_err(|e| DaemonError::Tokenize(e.to_string()))?;

        let input_ids: Vec<i64> = encoding.get_ids().iter().map(|&id| id as i64).collect();
        let attention_mask: Vec<i64> = encoding
            .get_attention_mask()
            .iter()
            .map(|&m| m as i64)
            .collect();
        let token_type_ids: Vec<i64> =
            encoding.get_type_ids().iter().map(|&t| t as i64).collect();
        let seq_len = input_ids.len();

        let input_ids_tensor = Tensor::from_array(([1, seq_len as i64], input_ids))?;
        let attention_mask_tensor =
            Tensor::from_array(([1, seq_len as i64], attention_mask.clone()))?;
        let token_type_ids_tensor =
            Tensor::from_array(([1, seq_len as i64], token_type_ids))?;

        let outputs = session
            .run(ort::inputs![
                "input_ids" => input_ids_tensor,
                "attention_mask" => attention_mask_tensor,
                "token_type_ids" => token_type_ids_tensor,
            ])
            .map_err(|e| DaemonError::Inference(e.to_string()))?;

        let output_value = &outputs[0];
        let (shape, data) = output_value
            .try_extract_tensor::<f32>()
            .map_err(|e| DaemonError::Extract(e.to_string()))?;
        let hidden_dim = shape[2] as usize;

        let mut pooled = mean_pool(data, &attention_mask, seq_len, hidden_dim);
        l2_normalize(&mut pooled);
        results.push(pooled);
    }

    Ok(results)
}

// --- PID file ---

fn write_pid_file(path: &Path) -> Result<(), DaemonError> {
    let pid = process::id();
    fs::write(path, pid.to_string())?;
    Ok(())
}

fn remove_pid_file(path: &Path) {
    let _ = fs::remove_file(path);
}

fn check_stale_pid(pid_path: &Path) -> bool {
    if let Ok(contents) = fs::read_to_string(pid_path) {
        if let Ok(pid) = contents.trim().parse::<u32>() {
            // Check if process is alive via kill(0)
            unsafe {
                if libc::kill(pid as i32, 0) == 0 {
                    return false; // Process alive, not stale
                }
            }
        }
    }
    true // Stale or unreadable
}

// --- Response writing ---

/// Write a JSON-line response as a single atomic write_all to avoid fragmentation.
fn send_response(writer: &mut UnixStream, json: &str) {
    let mut buf = Vec::with_capacity(json.len() + 1);
    buf.extend_from_slice(json.as_bytes());
    buf.push(b'\n');
    let _ = writer.write_all(&buf);
    let _ = writer.flush();
}

// --- Connection handler ---

fn handle_connection(
    stream: UnixStream,
    session: Arc<Mutex<Session>>,
    tokenizer: Arc<Tokenizer>,
    last_activity: Arc<Mutex<Instant>>,
    shutdown_flag: &'static AtomicBool,
    max_batch: usize,
) {
    let mut reader = match stream.try_clone() {
        Ok(s) => BufReader::new(s),
        Err(_) => return,
    };
    let mut writer = stream;
    let mut line = String::new();

    loop {
        line.clear();
        let bytes_read = match reader.read_line(&mut line) {
            Ok(n) => n,
            Err(_) => break,
        };
        if bytes_read == 0 {
            break;
        }

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Update last activity
        if let Ok(mut t) = last_activity.lock() {
            *t = Instant::now();
        }

        let req: Request = match serde_json::from_str(trimmed) {
            Ok(r) => r,
            Err(e) => {
                let resp = serde_json::to_string(&ErrorResponse {
                    id: "unknown".to_string(),
                    error: format!("parse: {}", e),
                })
                .unwrap_or_default();
                send_response(&mut writer, &resp);
                continue;
            }
        };

        let req_id = req.id.unwrap_or_else(|| "unknown".to_string());

        match req.method.as_str() {
            "health" => {
                let resp = serde_json::to_string(&HealthResponse {
                    id: req_id,
                    status: "ok".to_string(),
                    model: "nomic-embed-text-v1.5".to_string(),
                })
                .unwrap_or_default();
                send_response(&mut writer, &resp);
            }
            "shutdown" => {
                let resp = serde_json::to_string(&ShutdownResponse {
                    id: req_id,
                    status: "shutting_down".to_string(),
                })
                .unwrap_or_default();
                send_response(&mut writer, &resp);
                shutdown_flag.store(true, Ordering::SeqCst);
                break;
            }
            "embed" => {
                let texts = req.texts.unwrap_or_default();
                if texts.is_empty() {
                    let resp = serde_json::to_string(&EmbedResponse {
                        id: req_id,
                        vectors: vec![],
                    })
                    .unwrap_or_default();
                    send_response(&mut writer, &resp);
                    continue;
                }
                if texts.len() > max_batch {
                    let resp = serde_json::to_string(&ErrorResponse {
                        id: req_id,
                        error: format!("batch too large: {} (max {})", texts.len(), max_batch),
                    })
                    .unwrap_or_default();
                    send_response(&mut writer, &resp);
                    continue;
                }

                let result = {
                    let mut sess = session.lock().unwrap();
                    embed_texts(&mut sess, &tokenizer, &texts)
                };

                match result {
                    Ok(vectors) => {
                        let resp = serde_json::to_string(&EmbedResponse {
                            id: req_id,
                            vectors,
                        })
                        .unwrap_or_default();
                        send_response(&mut writer, &resp);
                    }
                    Err(e) => {
                        let resp = serde_json::to_string(&ErrorResponse {
                            id: req_id,
                            error: e.to_string(),
                        })
                        .unwrap_or_default();
                        send_response(&mut writer, &resp);
                    }
                }
            }
            other => {
                let resp = serde_json::to_string(&ErrorResponse {
                    id: req_id,
                    error: format!("unknown method: {}", other),
                })
                .unwrap_or_default();
                send_response(&mut writer, &resp);
            }
        }
    }
}

// --- Main ---

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();

    // Parse arguments: ca-embed <socket-path> <model-path> <tokenizer-path>
    let socket_path = args
        .get(1)
        .map(|s| s.to_string())
        .or_else(|| env::var("CA_EMBED_SOCKET").ok())
        .unwrap_or_else(|| "/tmp/ca-embed.sock".to_string());

    let model_path = args
        .get(2)
        .map(PathBuf::from)
        .or_else(|| env::var("CA_EMBED_MODEL").ok().map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from("model_quantized.onnx"));

    let tokenizer_path = args
        .get(3)
        .map(PathBuf::from)
        .or_else(|| env::var("CA_EMBED_TOKENIZER").ok().map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from("tokenizer.json"));

    let idle_timeout_secs: u64 = env::var("CA_EMBED_IDLE_TIMEOUT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(300); // 5 minutes

    let max_batch: usize = env::var("CA_EMBED_MAX_BATCH")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(64);

    // Derive PID file path from socket path
    let pid_path = PathBuf::from(format!("{}.pid", socket_path));

    // Check for stale PID file
    if pid_path.exists() && !check_stale_pid(&pid_path) {
        eprintln!("daemon already running (PID file: {})", pid_path.display());
        process::exit(1);
    }

    // Validate model files exist
    if !model_path.exists() {
        eprintln!("ONNX model not found: {}", model_path.display());
        process::exit(1);
    }
    if !tokenizer_path.exists() {
        eprintln!("tokenizer not found: {}", tokenizer_path.display());
        process::exit(1);
    }

    // Load tokenizer
    let tokenizer = Tokenizer::from_file(&tokenizer_path)
        .map_err(|e| format!("load tokenizer: {}", e))?;
    eprintln!("[ca-embed] tokenizer loaded");

    // Load ONNX model
    let session = Session::builder()?
        .with_intra_threads(4)?
        .commit_from_file(&model_path)?;
    eprintln!("[ca-embed] model loaded");

    // Remove stale socket
    let _ = fs::remove_file(&socket_path);

    // Write PID file
    write_pid_file(&pid_path)?;
    eprintln!("[ca-embed] PID file: {}", pid_path.display());

    // SIGTERM/SIGINT handler
    unsafe {
        libc::signal(libc::SIGTERM, signal_handler as *const () as libc::sighandler_t);
        libc::signal(libc::SIGINT, signal_handler as *const () as libc::sighandler_t);
    }

    // Bind socket
    let listener = UnixListener::bind(&socket_path)?;
    listener
        .set_nonblocking(true)
        .expect("set_nonblocking failed");
    eprintln!("[ca-embed] listening on {}", socket_path);

    // Print ready marker (Go client waits for this)
    eprintln!("[ca-embed] ready");

    let session = Arc::new(Mutex::new(session));
    let tokenizer = Arc::new(tokenizer);
    let last_activity = Arc::new(Mutex::new(Instant::now()));
    let idle_timeout = Duration::from_secs(idle_timeout_secs);

    // Accept loop
    loop {
        if SHUTDOWN_FLAG.load(Ordering::SeqCst) {
            eprintln!("[ca-embed] shutdown requested");
            break;
        }

        // Check idle timeout
        {
            let last = last_activity.lock().unwrap();
            if last.elapsed() > idle_timeout {
                eprintln!("[ca-embed] idle timeout ({}s), exiting", idle_timeout_secs);
                break;
            }
        }

        match listener.accept() {
            Ok((stream, _)) => {
                // Accepted streams must be blocking for write_all correctness.
                // macOS inherits non-blocking from listener; override it.
                stream.set_nonblocking(false).ok();

                let sess = session.clone();
                let tok = tokenizer.clone();
                let activity = last_activity.clone();

                thread::spawn(move || {
                    handle_connection(stream, sess, tok, activity, &SHUTDOWN_FLAG, max_batch);
                });
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                // No pending connection, sleep briefly
                thread::sleep(Duration::from_millis(50));
            }
            Err(e) => {
                eprintln!("[ca-embed] accept error: {}", e);
            }
        }
    }

    // Cleanup
    remove_pid_file(&pid_path);
    let _ = fs::remove_file(&socket_path);
    eprintln!("[ca-embed] exited cleanly");
    Ok(())
}

static SHUTDOWN_FLAG: AtomicBool = AtomicBool::new(false);

extern "C" fn signal_handler(_sig: libc::c_int) {
    SHUTDOWN_FLAG.store(true, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mean_pool_basic() {
        // 2 tokens, 3 dimensions, all active
        let embeddings = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
        let mask = vec![1, 1];
        let result = mean_pool(&embeddings, &mask, 2, 3);
        assert_eq!(result, vec![2.5, 3.5, 4.5]);
    }

    #[test]
    fn test_mean_pool_with_padding() {
        // 3 tokens, 2 dims, last token masked
        let embeddings = vec![1.0, 2.0, 3.0, 4.0, 0.0, 0.0];
        let mask = vec![1, 1, 0];
        let result = mean_pool(&embeddings, &mask, 3, 2);
        assert_eq!(result, vec![2.0, 3.0]);
    }

    #[test]
    fn test_mean_pool_all_masked() {
        let embeddings = vec![1.0, 2.0, 3.0, 4.0];
        let mask = vec![0, 0];
        let result = mean_pool(&embeddings, &mask, 2, 2);
        assert_eq!(result, vec![0.0, 0.0]);
    }

    #[test]
    fn test_l2_normalize_unit() {
        let mut v = vec![1.0, 0.0, 0.0];
        l2_normalize(&mut v);
        assert_eq!(v, vec![1.0, 0.0, 0.0]);
    }

    #[test]
    fn test_l2_normalize_basic() {
        let mut v = vec![3.0, 4.0];
        l2_normalize(&mut v);
        let expected_mag = 5.0f32;
        assert!((v[0] - 3.0 / expected_mag).abs() < 1e-6);
        assert!((v[1] - 4.0 / expected_mag).abs() < 1e-6);
    }

    #[test]
    fn test_l2_normalize_zero_vector() {
        let mut v = vec![0.0, 0.0, 0.0];
        l2_normalize(&mut v);
        assert_eq!(v, vec![0.0, 0.0, 0.0]);
    }

    #[test]
    fn test_request_deserialization() {
        let json = r#"{"id":"r1","method":"health"}"#;
        let req: Request = serde_json::from_str(json).unwrap();
        assert_eq!(req.id, Some("r1".to_string()));
        assert_eq!(req.method, "health");
        assert!(req.texts.is_none());
    }

    #[test]
    fn test_request_deserialization_embed() {
        let json = r#"{"method":"embed","texts":["hello","world"]}"#;
        let req: Request = serde_json::from_str(json).unwrap();
        assert_eq!(req.method, "embed");
        assert_eq!(req.texts.unwrap(), vec!["hello", "world"]);
    }

    #[test]
    fn test_embed_response_serialization() {
        let resp = EmbedResponse {
            id: "e1".to_string(),
            vectors: vec![vec![0.1, 0.2], vec![0.3, 0.4]],
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"id\":\"e1\""));
        assert!(json.contains("\"vectors\""));
    }

    #[test]
    fn test_error_response_serialization() {
        let resp = ErrorResponse {
            id: "err1".to_string(),
            error: "something broke".to_string(),
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"error\":\"something broke\""));
    }

    #[test]
    fn test_health_response_serialization() {
        let resp = HealthResponse {
            id: "h1".to_string(),
            status: "ok".to_string(),
            model: "nomic-embed-text-v1.5".to_string(),
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"status\":\"ok\""));
        assert!(json.contains("\"model\":\"nomic-embed-text-v1.5\""));
    }

    #[test]
    fn test_shutdown_response_serialization() {
        let resp = ShutdownResponse {
            id: "s1".to_string(),
            status: "shutting_down".to_string(),
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"status\":\"shutting_down\""));
    }
}
