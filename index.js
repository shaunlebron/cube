'use strict';

const state = {
  t: 0,
  numDims: null,
  rotateSpeed: [],
};
const maxDims = 4;

//----------------------------------------------------------------------
// Canvas
//----------------------------------------------------------------------

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');

let canvasW, canvasH;

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  canvasW = window.innerWidth;
  canvasH = window.innerHeight;
  canvas.width = canvasW * ratio;
  canvas.height = canvasH * ratio;
  canvas.style.width = `${canvasW}px`;
  canvas.style.height = `${canvasH}px`;
  ctx.scale(ratio, ratio);
  draw();
}
document.body.onresize = resizeCanvas;

//----------------------------------------------------------------------
// Animate
//----------------------------------------------------------------------

function advanceAnim(dt) {
  state.t += dt;
  draw();
}

let lastTime;
function tick(t) {
  let dt;
  if (lastTime) {
    dt = t - lastTime;
  } else {
    dt = 0;
  }
  lastTime = t;
  advanceAnim(dt);
  window.requestAnimationFrame(tick);
}

//----------------------------------------------------------------------
// Cube
//----------------------------------------------------------------------

// CUBE VERTICES represented as binary digits allows us to generalize cubes
// across dimensions, simply by adding a digit for each dimension.
//
// With this in mind, we represent a vertex as a single index.
//
// Index     Binary    Vertex (centered)
//  0         000       [-1,-1,-1]
//  1         001       [-1,-1, 1]
//  2         010       [-1, 1,-1]
//  3         011       [-1, 1, 1]
//  4         100       [ 1,-1,-1]
//  5         101       [ 1,-1, 1]
//  6         110       [ 1, 1,-1]
//  7         111       [ 1, 1, 1]
//
// A vertex has an EDGE connecting to every vertex equal to itself with exactly
// one dimension inverted. For example:
//
// Vertex 3 (binary 011) is connected to vertices 7, 1, and 2:
//
//   3  =>  011        => 111  =>  7
//          ^invert
//
//   3  =>  011        => 001  =>  1
//           ^invert
//
//   3  =>  011        => 010  =>  2
//            ^invert
//

// Number of vertices
function numVerts(numDims) {
  const d = numDims || state.numDims;
  return Math.pow(2,d);
}
console.assert(numVerts(2) === 4);
console.assert(numVerts(3) === 8);
console.assert(numVerts(4) === 16);


function vert(i) {
  const v = [];
  for (let d=0; d<maxDims; d++) {
    if (d < state.numDims) {
      const bit = (i >> d) & 1;
      const coord = (bit === 0) ? -1 : 1;
      v.push(coord);
    } else {
      v.push(0); // use 0 for unused dimensions
    }
  }
  return v;
}

function* edges() {
  for (let i=0; i<numVerts(); i++) {
    for (let d=0; d<state.numDims; d++) {
      const j = i ^ (1 << d); // toggle bit at d
      if (i < j) { // ensure no duplicate edges
        yield [i,j];
      }
    }
  }
}

//----------------------------------------------------------------------
// Camera Projection
//----------------------------------------------------------------------

const camDistZ = 2;
const camDistW = 2;
const cubeDistZ = camDistZ*2.5;
const cubeDistW = camDistW*2.5;

// 4d to 3d projection
function toSpace([x,y,z,w]) {
  return [
    x/w*camDistW,
    y/w*camDistW,
    z/w*camDistW,
  ];
}

// 3d to 2d projection
function toPlane([x,y,z]) {
  return [
    x/z*camDistZ,
    y/z*camDistZ,
  ];
}

// 2d to screen
function toScreen([x,y]) {
  const s = Math.min(canvasW, canvasH)/2;
  return [
    x*s,
    y*s,
  ];
}

function setupCamera() {
  ctx.translate(canvasW/2, canvasH/2);
}

//----------------------------------------------------------------------
// Camera Projection
//----------------------------------------------------------------------

// Shift object away from camera for projection.
function translate(v) {
  let [x,y,z,w] = v;
  z += cubeDistZ;
  w += cubeDistW;
  return [x,y,z,w];
}

// Rotate a coordinate around all rotation planes.
//
// x y z w
// -------
// * *      xy (2d)
// *   *    xz (3d)
//   * *    yz (3d)
// *     *  xw (4d)
//   *   *  yw (4d)
//     * *  zw (4d)

// Number of rotation planes
function numRots(numDims) {
  const d = numDims || state.numDims;
  return d * (d-1) / 2;
}
console.assert(numRots(2) === 1);
console.assert(numRots(3) === 3);
console.assert(numRots(4) === 6);

function rotate([x,y,z,w]) {
  const v = [x,y,z,w];
  let rotIndex = 0;
  const d = state.numDims;
  const time = Math.max(0, state.t - 100); // wait a little bit
  for (let i=0; i<d-1; i++) {
    for (let j=i+1; j<d; j++) {
      const t = state.rotateSpeed[rotIndex] * time / 1000;
      const [a,b] = [v[i], v[j]];
      v[i] = a*Math.cos(t) - b*Math.sin(t);
      v[j] = a*Math.sin(t) + b*Math.cos(t);
      rotIndex++;
    }
  }
  return v;
}

function transform(v) {
  const v0 = rotate(v);
  const v1 = translate(v0);
  return v1;
}

//----------------------------------------------------------------------
// Draw
//----------------------------------------------------------------------

function mapRange(value, oldmin, oldmax, newmin, newmax) {
  const oldrange = oldmax - oldmin;
  const newrange = newmax - newmin;
  return newmin + (value-oldmin)/oldrange*newrange;
}

let zRange = {
  2: {},
  3: {},
  4: {},
};
function updateZRange(z) {
  const d = state.numDims;
  const {min, max}  = zRange[d];
  zRange[d].min = min == null ? z : Math.min(min,z);
  zRange[d].max = max == null ? z : Math.max(max,z);
}
function zDepth(z) {
  updateZRange(z);
  const {min, max}  = zRange[state.numDims];
  const opacity = mapRange(z, max, min, 0.1, 0.7);
  const thickness = mapRange(z, max, min, 2, 3);
  return {opacity, thickness};
}

function line4d(a,b) {
  line3d(toSpace(a), toSpace(b));
}

function line3d(a,b) {
  const count = 10;
  const interp = (i) => [
    a[0]+(b[0]-a[0])/count*i,
    a[1]+(b[1]-a[1])/count*i,
    a[2]+(b[2]-a[2])/count*i
  ];
  for (let i=0; i<count; i++) {
    const c = interp(i);
    const d = interp(i+1);
    const {opacity, thickness} = zDepth(c[2]);
    ctx.beginPath();
    line2d(toPlane(c), toPlane(d), (c[2]));
    ctx.strokeStyle = `rgba(0,0,0,${opacity})`;
    ctx.lineWidth = thickness;
    ctx.stroke();
  }
}

function line2d(a,b) {
  line(toScreen(a), toScreen(b));
}

function line(a,b) {
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
}

function drawCube() {
  for (let [i,j] of edges()) {
    line4d(transform(vert(i)), transform(vert(j)));
  }
}

function draw() {
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.save();
  setupCamera();
  drawCube();
  ctx.restore();
}

//----------------------------------------------------------------------
// Load
//----------------------------------------------------------------------

// randomize rotation speeds
for (let i=0; i<numRots(maxDims); i++) {
  const range = Math.PI / 4;
  const r = Math.random()*range - range/2;
  state.rotateSpeed[i] = r;
}

function setNumDims(d) {
  state.numDims = d;
  localStorage.numDims = d;
}

document.body.onkeydown = (e) => {
  switch (e.key) {
    case '2': setNumDims(2); break;
    case '3': setNumDims(3); break;
    case '4': setNumDims(4); break;
  }
};

setNumDims(parseInt(localStorage.numDims,10) || 4);

resizeCanvas();
window.requestAnimationFrame(tick);
