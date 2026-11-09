const sharp = require("sharp");

const MAX_INPUT_PIXELS = 40_000_000;
const ANALYSIS_WIDTH = 500;
const ANALYSIS_HEIGHT = 850;

function calculateLaplacianVariance(data, width, height) {
  let sum = 0;
  let sumSquares = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const laplacian =
        data[index - 1] +
        data[index + 1] +
        data[index - width] +
        data[index + width] -
        4 * data[index];

      sum += laplacian;
      sumSquares += laplacian * laplacian;
      count += 1;
    }
  }

  if (!count) return 0;
  const mean = sum / count;
  return Math.max(0, sumSquares / count - mean * mean);
}

function calculateTone(data) {
  let sum = 0;
  let sumSquares = 0;
  let clippedHighlights = 0;
  let clippedShadows = 0;

  for (let i = 0; i < data.length; i += 1) {
    const value = data[i];
    sum += value;
    sumSquares += value * value;
    if (value >= 254) clippedHighlights += 1;
    if (value <= 2) clippedShadows += 1;
  }

  const mean = sum / data.length;
  const variance = Math.max(0, sumSquares / data.length - mean * mean);

  return {
    brightness: Number(mean.toFixed(1)),
    contrast: Number(Math.sqrt(variance).toFixed(1)),
    clippedHighlightRatio: clippedHighlights / data.length,
    clippedShadowRatio: clippedShadows / data.length,
  };
}

// Estimates a small document skew by finding the angle that makes dark text
// pixels most horizontally aligned. It is a heuristic, not a perspective fix.
function estimateCorrectionAngle(data, width, height) {
  const centerX = width / 2;
  const centerY = height / 2;
  const threshold = 160;
  let best = { angle: 0, score: -1 };

  for (let candidate = -10; candidate <= 10.001; candidate += 0.5) {
    const radians = (candidate * Math.PI) / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const histogram = new Uint32Array(height + 100);

    for (let y = 0; y < height; y += 1) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x += 1) {
        if (data[rowOffset + x] >= threshold) continue;
        const projectedY = Math.round(
          centerY + (y - centerY) * cosine - (x - centerX) * sine
        ) + 50;
        if (projectedY >= 0 && projectedY < histogram.length) {
          histogram[projectedY] += 1;
        }
      }
    }

    let score = 0;
    for (let i = 0; i < histogram.length; i += 1) {
      score += histogram[i] * histogram[i];
    }

    if (score > best.score) best = { angle: candidate, score };
  }

  // The candidate describes the correction to apply in the projection space.
  return Math.abs(best.angle) < 1.25 ? 0 : -best.angle;
}

async function inspectDocumentImage(inputBuffer) {
  if (!Buffer.isBuffer(inputBuffer) || inputBuffer.length === 0) {
    throw new Error("The uploaded image is empty or invalid.");
  }

  const input = sharp(inputBuffer, { limitInputPixels: MAX_INPUT_PIXELS });
  const originalMetadata = await input.metadata();
  if (!originalMetadata.width || !originalMetadata.height) {
    throw new Error("The uploaded image dimensions could not be read.");
  }

  // Normalize EXIF orientation before assessing quality or running OCR.
  const orientedBuffer = await sharp(inputBuffer, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .toBuffer();
  const orientedMetadata = await sharp(orientedBuffer).metadata();
  const { data, info } = await sharp(orientedBuffer)
    .greyscale()
    .resize({
      width: ANALYSIS_WIDTH,
      height: ANALYSIS_HEIGHT,
      fit: "inside",
      withoutEnlargement: true,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const blurVariance = calculateLaplacianVariance(data, info.width, info.height);
  const tone = calculateTone(data);
  const correctionAngle = estimateCorrectionAngle(data, info.width, info.height);
  const warnings = [];
  const hardFailures = [];

  const shortestSide = Math.min(orientedMetadata.width, orientedMetadata.height);
  if (shortestSide < 480) {
    hardFailures.push("The image resolution is too low to reliably read the document. Upload a higher-resolution image.");
  }
  if (blurVariance < 70) {
    hardFailures.push("The document photo is too blurry to read reliably. Please retake it in focus and upload a clearer image.");
  }
  if (tone.brightness < 45) {
    hardFailures.push("The image is too dark to read. Please upload a well-lit photograph.");
  }
  if (tone.contrast < 7) {
    hardFailures.push("The image has very low contrast. Please upload a clearer photograph.");
  }
  if (tone.clippedHighlightRatio > 0.985) {
    hardFailures.push("The image is almost completely overexposed. Please retake the document without direct glare.");
  }
  if (tone.clippedShadowRatio > 0.985) {
    hardFailures.push("The image is almost completely underexposed. Please retake the document in better lighting.");
  }

  let ocrBuffer = orientedBuffer;
  let deskewed = false;
  if (Math.abs(correctionAngle) >= 2 && Math.abs(correctionAngle) <= 9.5) {
    ocrBuffer = await sharp(orientedBuffer)
      .rotate(correctionAngle, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();
    deskewed = true;
    warnings.push("The document was slightly tilted. It was straightened for OCR; please check the preview before relying on extracted details.");
  } else if (Math.abs(correctionAngle) > 9.5) {
    warnings.push("The document appears significantly tilted. A reviewer should inspect its orientation.");
  }

  if (tone.clippedHighlightRatio > 0.92 && tone.clippedHighlightRatio <= 0.985) {
    warnings.push("Some image highlights may be washed out. Check that no document details are hidden by glare.");
  }

  return {
    ocrBuffer,
    needsReupload: hardFailures.length > 0,
    result: {
      status: hardFailures.length ? "reupload-required" : warnings.length ? "review" : "good",
      blurVariance: Number(blurVariance.toFixed(1)),
      brightness: tone.brightness,
      contrast: tone.contrast,
      width: orientedMetadata.width,
      height: orientedMetadata.height,
      skewCorrectionDegrees: Number(correctionAngle.toFixed(1)),
      deskewed,
      warnings,
      issues: hardFailures,
    },
  };
}

module.exports = { inspectDocumentImage };
