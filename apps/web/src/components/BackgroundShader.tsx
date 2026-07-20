'use client';

import React, { useEffect, useRef } from 'react';

export default function BackgroundShader() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl');
    if (!gl) return;

    const vertexShaderSource = `
      attribute vec2 position;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
        v_texCoord = position * 0.5 + 0.5;
      }
    `;

    const fragmentShaderSource = `
      precision highp float;
      uniform float u_time;
      uniform vec2 u_resolution;
      varying vec2 v_texCoord;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }

      void main() {
        vec2 uv = v_texCoord;
        vec2 p = (uv - 0.5) * 2.0;
        p.x *= u_resolution.x / u_resolution.y;

        float time = u_time * 0.2;
        
        // Background glow
        vec3 color = vec3(0.976, 0.976, 0.98); // Base surface
        
        // Floating particles
        for(float i = 0.0; i < 40.0; i++) {
          float h = hash(vec2(i, 1.0));
          vec2 pos = vec2(
            sin(time * (0.5 + h) + h * 6.28) * 1.2,
            cos(time * (0.3 + h) + h * 6.28) * 1.0
          );
          
          float dist = length(p - pos);
          float brightness = 0.002 / (dist * dist);
          color += vec3(0.06, 0.09, 0.16) * brightness * h; // Deep navy particles
        }

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    function createShader(gl: WebGLRenderingContext, type: number, source: string) {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    }

    const program = gl.createProgram();
    const vs = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    if (!program || !vs || !fs) return;

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const timeLocation = gl.getUniformLocation(program, "u_time");
    const resolutionLocation = gl.getUniformLocation(program, "u_resolution");

    function resize() {
      if (!canvas || !gl) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    }

    window.addEventListener('resize', resize);
    resize();

    let animationFrameId: number;
    function renderShader(time: number) {
      if (!gl) return;
      gl.uniform1f(timeLocation, time * 0.001);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animationFrameId = requestAnimationFrame(renderShader);
    }
    animationFrameId = requestAnimationFrame(renderShader);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas id="bg-canvas" ref={canvasRef} className="fixed inset-0 w-screen h-screen z-[-2] pointer-events-none" />;
}
