import sharp, { AvailableFormatInfo, FormatEnum } from "sharp";
import { logger } from "./logger.js";

export type ImageOptimizationParams = {
    width?: string | null;
    height?: string | null;
    quality?: string | null;
    format?: string | null;
    accept?: string | string[] | undefined;
};

export type OptimizedImage = {
    buffer: Buffer;
    format: string | null;
    contentType: string | null;
};

function parseDimension(value: string | null | undefined): number | undefined {
    if (!value) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function optimizeImage(buffer: Buffer, params: ImageOptimizationParams): Promise<OptimizedImage> {
    try {
        let pipeline = sharp(buffer);
        const metadata = await pipeline.metadata();
        const width = parseDimension(params.width);
        const height = parseDimension(params.height);
        const quality = parseDimension(params.quality) ?? 80;
        const accept = Array.isArray(params.accept) ? params.accept.join(",") : params.accept ?? "";

        if (width || height) {
            pipeline = pipeline.resize({ width, height, fit: "inside", withoutEnlargement: true });
        }

        let targetFormat = params.format ?? undefined;
        if (!targetFormat) {
            if (accept.includes("image/avif")) targetFormat = "avif";
            else if (accept.includes("image/webp")) targetFormat = "webp";
            else targetFormat = metadata.format;
        }
        if (!targetFormat) return { buffer, format: null, contentType: null };

        pipeline = pipeline.toFormat(targetFormat as keyof FormatEnum, { quality, effort: 4 });
        const optimizedBuffer = await pipeline.toBuffer();
        return { buffer: optimizedBuffer, format: targetFormat, contentType: `image/${targetFormat}` };
    } catch (error) {
        logger.error("Image optimization failed", { error: error instanceof Error ? error.message : "unknown" });
        return { buffer, format: null, contentType: null };
    }
}
