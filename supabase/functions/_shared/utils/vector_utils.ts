// supabase/functions/_shared/utils/vector_utils.ts

/**
 * Calculates the dot product of two vectors.
 * @param vecA - The first vector.
 * @param vecB - The second vector.
 * @returns The dot product.
 */
function dotProduct(vecA: number[], vecB: number[]): number {
    let product = 0;
    for (let i = 0; i < vecA.length; i++) {
        product += vecA[i] * vecB[i];
    }
    return product;
}

/**
 * Calculates the magnitude (L2 norm) of a vector.
 * @param vec - The vector.
 * @returns The magnitude of the vector.
 */
function magnitude(vec: number[]): number {
    let sum = 0;
    for (let i = 0; i < vec.length; i++) {
        sum += vec[i] * vec[i];
    }
    return Math.sqrt(sum);
}

/**
 * Calculates the cosine similarity between two vectors.
 * @param vecA - The first vector.
 * @param vecB - The second vector.
 * @returns The cosine similarity, a value between -1 and 1.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length || vecA.length === 0) {
        return 0;
    }

    const A = dotProduct(vecA, vecB);
    const B = magnitude(vecA);
    const C = magnitude(vecB);

    if (B === 0 || C === 0) {
        return 0;
    }

    return A / (B * C);
}
