/**
 * Polyfills DOMMatrix, ImageData, and Path2D in Node.js environments (such as Vercel serverless).
 * This prevents pdfjs-dist and related PDF processing libraries from failing on module evaluation with:
 * "ReferenceError: DOMMatrix is not defined"
 */
export function setupCanvasPolyfills(): void {
  if (typeof globalThis.DOMMatrix === "undefined") {
    globalThis.DOMMatrix = class DOMMatrix {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
      m11 = 1;
      m12 = 0;
      m13 = 0;
      m14 = 0;
      m21 = 0;
      m22 = 1;
      m23 = 0;
      m24 = 0;
      m31 = 0;
      m32 = 0;
      m33 = 1;
      m34 = 0;
      m41 = 0;
      m42 = 0;
      m43 = 0;
      m44 = 1;
      is2D = true;
      isIdentity = true;

      constructor(init?: number[] | string) {
        if (Array.isArray(init)) {
          if (init.length === 6) {
            this.a = init[0];
            this.b = init[1];
            this.c = init[2];
            this.d = init[3];
            this.e = init[4];
            this.f = init[5];
            this.m11 = init[0];
            this.m12 = init[1];
            this.m21 = init[2];
            this.m22 = init[3];
            this.m41 = init[4];
            this.m42 = init[5];
          } else if (init.length === 16) {
            this.m11 = init[0];
            this.m12 = init[1];
            this.m13 = init[2];
            this.m14 = init[3];
            this.m21 = init[4];
            this.m22 = init[5];
            this.m23 = init[6];
            this.m24 = init[7];
            this.m31 = init[8];
            this.m32 = init[9];
            this.m33 = init[10];
            this.m34 = init[11];
            this.m41 = init[12];
            this.m42 = init[13];
            this.m43 = init[14];
            this.m44 = init[15];
            this.a = this.m11;
            this.b = this.m12;
            this.c = this.m21;
            this.d = this.m22;
            this.e = this.m41;
            this.f = this.m42;
            this.is2D = false;
          }
        }
      }

      multiply(other?: any) {
        return this;
      }
      translate(tx = 0, ty = 0, tz = 0) {
        return this;
      }
      scale(sx = 1, sy = sx, sz = 1) {
        return this;
      }
      transformPoint(pt?: any) {
        return pt || { x: 0, y: 0, z: 0, w: 1 };
      }
      inverse() {
        return this;
      }
    } as any;
  }

  if (typeof globalThis.ImageData === "undefined") {
    globalThis.ImageData = class ImageData {
      width: number;
      height: number;
      data: Uint8ClampedArray;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.data = new Uint8ClampedArray(width * height * 4);
      }
    } as any;
  }

  if (typeof globalThis.Path2D === "undefined") {
    globalThis.Path2D = class Path2D {
      constructor() {}
      addPath() {}
      closePath() {}
      moveTo() {}
      lineTo() {}
      bezierCurveTo() {}
      quadraticCurveTo() {}
      arc() {}
      arcTo() {}
      ellipse() {}
      rect() {}
    } as any;
  }
}

// Automatically invoke on import
setupCanvasPolyfills();
