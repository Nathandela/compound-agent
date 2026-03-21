//! IPC embedding server: Unix domain socket server that runs ONNX inference.
//! Validates assumption A3 (UDS IPC latency < 5ms).

use ort::session::Session;
use ort::value::Tensor;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixListener;
use std::path::Path;
use tokenizers::Tokenizer;

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
    status: String,
}

#[derive(Serialize)]
struct ErrorResponse {
    id: String,
    error: String,
}

fn mean_pool(token_embeddings: &[f32], attention_mask: &[i64], seq_len: usize, hidden_dim: usize) -> Vec<f32> {
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
) -> Result<Vec<Vec<f32>>, Box<dyn std::error::Error>> {
    let mut results = Vec::with_capacity(texts.len());

    for text in texts {
        let encoding = tokenizer
            .encode(text.as_str(), true)
            .map_err(|e| format!("Tokenize error: {}", e))?;

        let input_ids: Vec<i64> = encoding.get_ids().iter().map(|&id| id as i64).collect();
        let attention_mask: Vec<i64> = encoding.get_attention_mask().iter().map(|&m| m as i64).collect();
        let token_type_ids: Vec<i64> = encoding.get_type_ids().iter().map(|&t| t as i64).collect();
        let seq_len = input_ids.len();

        let input_ids_tensor = Tensor::from_array(([1, seq_len as i64], input_ids))?;
        let attention_mask_tensor = Tensor::from_array(([1, seq_len as i64], attention_mask.clone()))?;
        let token_type_ids_tensor = Tensor::from_array(([1, seq_len as i64], token_type_ids))?;

        let outputs = session.run(ort::inputs![
            "input_ids" => input_ids_tensor,
            "attention_mask" => attention_mask_tensor,
            "token_type_ids" => token_type_ids_tensor,
        ])?;

        let output_value = &outputs[0];
        let (shape, data) = output_value.try_extract_tensor::<f32>()?;
        let hidden_dim = shape[2] as usize;

        let mut pooled = mean_pool(data, &attention_mask, seq_len, hidden_dim);
        l2_normalize(&mut pooled);
        results.push(pooled);
    }

    Ok(results)
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let socket_path = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "/tmp/ca-embed-spike.sock".to_string());

    let project_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let repo_root = project_dir
        .parent().unwrap()
        .parent().unwrap()
        .parent().unwrap()
        .parent().unwrap();

    let model_path = repo_root.join(
        "node_modules/.pnpm/@huggingface+transformers@3.8.1/\
         node_modules/@huggingface/transformers/.cache/\
         nomic-ai/nomic-embed-text-v1.5/onnx/model_quantized.onnx",
    );
    let tokenizer_path = repo_root.join(
        "node_modules/.pnpm/@huggingface+transformers@3.8.1/\
         node_modules/@huggingface/transformers/.cache/\
         nomic-ai/nomic-embed-text-v1.5/tokenizer.json",
    );

    eprintln!("Loading model: {}", model_path.display());
    assert!(model_path.exists(), "ONNX model not found: {}", model_path.display());
    assert!(tokenizer_path.exists(), "Tokenizer not found: {}", tokenizer_path.display());

    let tokenizer = Tokenizer::from_file(&tokenizer_path)
        .map_err(|e| format!("Failed to load tokenizer: {}", e))?;
    eprintln!("[OK] Tokenizer loaded");

    let mut session = Session::builder()?
        .with_intra_threads(4)?
        .commit_from_file(&model_path)?;
    eprintln!("[OK] ONNX model loaded");

    // Remove stale socket
    let _ = std::fs::remove_file(&socket_path);

    let listener = UnixListener::bind(&socket_path)?;
    eprintln!("[OK] Listening on {}", socket_path);

    // Accept connections (single-threaded, one client at a time for this spike)
    for stream in listener.incoming() {
        let stream = stream?;
        let mut reader = BufReader::new(stream.try_clone()?);
        let mut writer = stream;
        let mut line = String::new();
        let mut should_shutdown = false;

        loop {
            line.clear();
            let bytes_read = reader.read_line(&mut line)?;
            if bytes_read == 0 {
                break; // Client disconnected
            }

            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let req: Request = match serde_json::from_str(trimmed) {
                Ok(r) => r,
                Err(e) => {
                    let err_resp = serde_json::to_string(&ErrorResponse {
                        id: "unknown".to_string(),
                        error: format!("Parse error: {}", e),
                    })?;
                    writeln!(writer, "{}", err_resp)?;
                    writer.flush()?;
                    continue;
                }
            };

            match req.method.as_str() {
                "ping" => {
                    let resp = serde_json::to_string(&HealthResponse {
                        status: "pong".to_string(),
                    })?;
                    writeln!(writer, "{}", resp)?;
                    writer.flush()?;
                }
                "health" => {
                    let resp = serde_json::to_string(&HealthResponse {
                        status: "ok".to_string(),
                    })?;
                    writeln!(writer, "{}", resp)?;
                    writer.flush()?;
                }
                "shutdown" => {
                    let resp = serde_json::to_string(&HealthResponse {
                        status: "shutting_down".to_string(),
                    })?;
                    writeln!(writer, "{}", resp)?;
                    writer.flush()?;
                    should_shutdown = true;
                    break;
                }
                "embed" => {
                    let req_id = req.id.unwrap_or_else(|| "unknown".to_string());
                    let texts = req.texts.unwrap_or_default();

                    match embed_texts(&mut session, &tokenizer, &texts) {
                        Ok(vectors) => {
                            let resp = serde_json::to_string(&EmbedResponse {
                                id: req_id,
                                vectors,
                            })?;
                            writeln!(writer, "{}", resp)?;
                            writer.flush()?;
                        }
                        Err(e) => {
                            let err_resp = serde_json::to_string(&ErrorResponse {
                                id: req_id,
                                error: format!("Embed error: {}", e),
                            })?;
                            writeln!(writer, "{}", err_resp)?;
                            writer.flush()?;
                        }
                    }
                }
                other => {
                    let err_resp = serde_json::to_string(&ErrorResponse {
                        id: req.id.unwrap_or_else(|| "unknown".to_string()),
                        error: format!("Unknown method: {}", other),
                    })?;
                    writeln!(writer, "{}", err_resp)?;
                    writer.flush()?;
                }
            }
        }

        if should_shutdown {
            eprintln!("[OK] Shutting down");
            break;
        }
    }

    let _ = std::fs::remove_file(&socket_path);
    Ok(())
}
