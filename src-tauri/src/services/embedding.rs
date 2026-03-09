/// Anthropic text-embedding-3-small (OpenAI 互換 API) を使った埋め込み生成とコサイン類似度計算。
///
/// text-embedding-3-small: 1536 次元, 最大 8191 トークン
use crate::error::{AppError, Result};

/// テキストの埋め込みベクトルを取得する（OpenAI Embeddings API）。
/// api_key: OpenAI API キー
pub async fn embed_text(text: &str, api_key: &str) -> Result<Vec<f32>> {
    let client = reqwest::Client::builder()
        .user_agent("DevNest/0.1")
        .build()
        .map_err(|e| AppError::Anthropic(e.to_string()))?;

    // 入力テキストを 8000 文字に切り詰め（トークン制限の安全マージン）
    let truncated: String = text.chars().take(8000).collect();

    let resp = client
        .post("https://api.openai.com/v1/embeddings")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": "text-embedding-3-small",
            "input": truncated,
            "encoding_format": "float"
        }))
        .send()
        .await
        .map_err(|e| AppError::Anthropic(format!("Embedding API error: {}", e)))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::Anthropic(format!(
            "Embedding API returned {}: {}",
            status, body
        )));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Anthropic(format!("Embedding parse error: {}", e)))?;

    let embedding: Vec<f32> = body
        .get("data")
        .and_then(|d| d.get(0))
        .and_then(|d| d.get("embedding"))
        .and_then(|e| serde_json::from_value(e.clone()).ok())
        .ok_or_else(|| AppError::Anthropic("Unexpected embedding response shape".to_string()))?;

    Ok(embedding)
}

/// Vec<f32> を BLOB（little-endian bytes）にシリアライズする。
pub fn serialize_embedding(embedding: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(embedding.len() * 4);
    for &v in embedding {
        bytes.extend_from_slice(&v.to_le_bytes());
    }
    bytes
}

/// BLOB（little-endian bytes）を Vec<f32> にデシリアライズする。
pub fn deserialize_embedding(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        .collect()
}

/// コサイン類似度 ∈ [-1.0, 1.0] を計算する。
/// ゼロベクトル同士は 0.0 を返す。
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    dot / (norm_a * norm_b)
}

#[cfg(test)]
mod tests {
    use super::*;

    // 🔴 Red: 同一ベクトルのコサイン類似度は 1.0
    #[test]
    fn test_cosine_similarity_identical_vectors() {
        let v = vec![1.0f32, 2.0, 3.0];
        let sim = cosine_similarity(&v, &v);
        assert!((sim - 1.0).abs() < 1e-5, "同一ベクトルの類似度は 1.0: {}", sim);
    }

    // 🔴 Red: 直交ベクトルのコサイン類似度は 0.0
    #[test]
    fn test_cosine_similarity_orthogonal_vectors() {
        let a = vec![1.0f32, 0.0, 0.0];
        let b = vec![0.0f32, 1.0, 0.0];
        let sim = cosine_similarity(&a, &b);
        assert!(sim.abs() < 1e-5, "直交ベクトルの類似度は 0.0: {}", sim);
    }

    // 🔴 Red: 逆方向ベクトルのコサイン類似度は -1.0
    #[test]
    fn test_cosine_similarity_opposite_vectors() {
        let a = vec![1.0f32, 0.0];
        let b = vec![-1.0f32, 0.0];
        let sim = cosine_similarity(&a, &b);
        assert!((sim + 1.0).abs() < 1e-5, "逆方向ベクトルの類似度は -1.0: {}", sim);
    }

    // 🔴 Red: ゼロベクトルは 0.0 を返す
    #[test]
    fn test_cosine_similarity_zero_vector() {
        let a = vec![0.0f32, 0.0];
        let b = vec![1.0f32, 0.0];
        assert_eq!(cosine_similarity(&a, &b), 0.0);
        assert_eq!(cosine_similarity(&a, &a), 0.0);
    }

    // 🔴 Red: serialize → deserialize でラウンドトリップできること
    #[test]
    fn test_embedding_roundtrip() {
        let original: Vec<f32> = (0..1536).map(|i| i as f32 * 0.001).collect();
        let bytes = serialize_embedding(&original);
        let restored = deserialize_embedding(&bytes);
        assert_eq!(original.len(), restored.len());
        for (a, b) in original.iter().zip(restored.iter()) {
            assert!((a - b).abs() < 1e-6, "roundtrip mismatch: {} vs {}", a, b);
        }
    }

    // 🔴 Red: serialize の長さは len * 4 bytes
    #[test]
    fn test_serialize_length() {
        let v: Vec<f32> = vec![1.0, 2.0, 3.0];
        assert_eq!(serialize_embedding(&v).len(), 12);
    }

    // 🔴 Red: 1536 次元での serialize/deserialize
    #[test]
    fn test_serialize_1536_dims() {
        let v: Vec<f32> = vec![0.5f32; 1536];
        let bytes = serialize_embedding(&v);
        assert_eq!(bytes.len(), 1536 * 4);
        let restored = deserialize_embedding(&bytes);
        assert_eq!(restored.len(), 1536);
        assert!((restored[0] - 0.5).abs() < 1e-6);
    }
}
