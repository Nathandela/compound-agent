//! Vector compatibility spike: validate that the Rust ort crate produces
//! identical embeddings to the TypeScript Transformers.js implementation
//! for nomic-embed-text-v1.5 (ONNX Q8 quantized).
//!
//! Validates assumptions A2 (vector compatibility) and A6 (ort loads Q8 model).

use ort::session::Session;
use ort::value::Tensor;
use serde::Deserialize;
use std::path::Path;
use tokenizers::Tokenizer;

/// A reference text/vector pair from the TS implementation.
#[derive(Deserialize)]
struct ReferenceEntry {
    text: String,
    vector: Vec<f32>,
}

/// Cosine similarity between two vectors.
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    assert_eq!(a.len(), b.len(), "Vector dimensions must match");
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let mag_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let mag_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if mag_a == 0.0 || mag_b == 0.0 {
        return 0.0;
    }
    dot / (mag_a * mag_b)
}

/// Mean pooling: average token embeddings weighted by attention_mask.
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

/// L2-normalize a vector in place.
fn l2_normalize(v: &mut [f32]) {
    let magnitude: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if magnitude > 0.0 {
        for val in v.iter_mut() {
            *val /= magnitude;
        }
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let project_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let repo_root = project_dir.parent().unwrap().parent().unwrap().parent().unwrap();

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
    let reference_path = project_dir.parent().unwrap().join("reference-vectors.json");

    println!("=== Vector Compatibility Spike ===");
    println!("Model:     {}", model_path.display());
    println!("Tokenizer: {}", tokenizer_path.display());
    println!("Reference: {}", reference_path.display());

    assert!(model_path.exists(), "ONNX model not found: {}", model_path.display());
    assert!(tokenizer_path.exists(), "Tokenizer not found: {}", tokenizer_path.display());
    assert!(reference_path.exists(), "Reference vectors not found: {}", reference_path.display());

    // Load reference data
    let reference_json = std::fs::read_to_string(&reference_path)?;
    let references: Vec<ReferenceEntry> = serde_json::from_str(&reference_json)?;
    println!("\nLoaded {} reference vectors", references.len());

    // Load tokenizer
    let tokenizer = Tokenizer::from_file(&tokenizer_path)
        .map_err(|e| format!("Failed to load tokenizer: {}", e))?;
    println!("[OK] Tokenizer loaded");

    // Load ONNX model via ort
    let mut session = Session::builder()?
        .with_intra_threads(4)?
        .commit_from_file(&model_path)?;
    println!("[OK] ONNX model loaded via ort (validates A6)");

    // Print model info
    println!("\nModel inputs:");
    for input in session.inputs() {
        println!("  - {}", input.name());
    }
    println!("Model outputs:");
    for output in session.outputs() {
        println!("  - {}", output.name());
    }

    // Process each reference entry
    let mut all_pass = true;
    let mut min_sim: f32 = 1.0;
    let mut max_sim: f32 = 0.0;
    let mut total_sim: f64 = 0.0;
    let mut fail_count = 0;

    println!("\n--- Results ---");
    println!("{:<4} {:<10} {:<60} {}", "#", "sim", "text (truncated)", "status");
    println!("{}", "-".repeat(90));

    for (i, entry) in references.iter().enumerate() {
        // Tokenize
        let encoding = tokenizer
            .encode(entry.text.as_str(), true)
            .map_err(|e| format!("Tokenize failed for '{}': {}", entry.text, e))?;

        let input_ids: Vec<i64> = encoding.get_ids().iter().map(|&id| id as i64).collect();
        let attention_mask: Vec<i64> = encoding.get_attention_mask().iter().map(|&m| m as i64).collect();
        let token_type_ids: Vec<i64> = encoding.get_type_ids().iter().map(|&t| t as i64).collect();
        let seq_len = input_ids.len();

        // Create ort Tensor values
        let input_ids_tensor = Tensor::from_array(([1, seq_len as i64], input_ids.clone()))?;
        let attention_mask_tensor = Tensor::from_array(([1, seq_len as i64], attention_mask.clone()))?;
        let token_type_ids_tensor = Tensor::from_array(([1, seq_len as i64], token_type_ids))?;

        // Run inference
        let outputs = session.run(ort::inputs![
            "input_ids" => input_ids_tensor,
            "attention_mask" => attention_mask_tensor,
            "token_type_ids" => token_type_ids_tensor,
        ])?;

        // Extract output: shape [1, seq_len, 768]
        let output_value = &outputs[0];
        let (shape, data) = output_value.try_extract_tensor::<f32>()?;
        let hidden_dim = shape[2] as usize;

        // Mean pooling + L2 normalize (skip batch dim, work on [seq_len, hidden_dim])
        let mut pooled = mean_pool(data, &attention_mask, seq_len, hidden_dim);
        l2_normalize(&mut pooled);

        // Compare with reference
        let sim = cosine_similarity(&pooled, &entry.vector);
        let pass = sim > 0.999;

        let truncated_text: String = if entry.text.len() > 57 {
            format!("{}...", &entry.text[..57])
        } else {
            entry.text.clone()
        };
        let status = if pass { "PASS" } else { "FAIL" };

        println!("{:<4} {:.6}   {:<60} {}", i + 1, sim, truncated_text, status);

        if !pass {
            all_pass = false;
            fail_count += 1;
            println!("       Rust[0..5]: {:?}", &pooled[..5.min(pooled.len())]);
            println!("       TS  [0..5]: {:?}", &entry.vector[..5.min(entry.vector.len())]);
        }

        min_sim = min_sim.min(sim);
        max_sim = max_sim.max(sim);
        total_sim += sim as f64;
    }

    let avg_sim = total_sim / references.len() as f64;

    println!("{}", "-".repeat(90));
    println!("\n=== Summary ===");
    println!("Total pairs:  {}", references.len());
    println!("Passed:       {}", references.len() - fail_count);
    println!("Failed:       {}", fail_count);
    println!("Min cosine:   {:.6}", min_sim);
    println!("Max cosine:   {:.6}", max_sim);
    println!("Avg cosine:   {:.6}", avg_sim);

    if all_pass {
        println!("\n[PASS] A2 VALIDATED: All {} pairs have cosine_sim > 0.999", references.len());
        println!("[PASS] A6 VALIDATED: ort crate successfully loaded ONNX Q8 model");
    } else {
        println!("\n[FAIL] {} pairs below 0.999 threshold", fail_count);
        std::process::exit(1);
    }

    Ok(())
}
