import * as THREE from 'three';
import { NOSE_STYLES, noseGeoName } from './data.js';

function rotateVertex(pt, pivot, rotDeg) {
  if (!rotDeg || (!rotDeg[0] && !rotDeg[1] && !rotDeg[2])) return pt;
  const v = new THREE.Vector3(pt[0] - pivot[0], pt[1] - pivot[1], pt[2] - pivot[2]);
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(-rotDeg[0]),
    THREE.MathUtils.degToRad(-rotDeg[1]),
    THREE.MathUtils.degToRad(rotDeg[2]),
    'ZYX'
  );
  v.applyEuler(euler);
  return [v.x + pivot[0], v.y + pivot[1], v.z + pivot[2]];
}

export function buildVillagerGeometry(geoData, includePredicate = () => true, geoName = 'geometry.villager_v2') {
  const geoObj = geoData[geoName];
  const positions = [], normals = [], uvs = [], indices = [];
  
  const texWidth = geoObj?.texturewidth || geoObj?.texture_width || 64;
  const texHeight = geoObj?.textureheight || geoObj?.texture_height || 64;

  for (const bone of (geoObj ? geoObj.bones : [])) {
    if (!includePredicate(bone.name)) continue;
    
    const boneRot = bone.bind_pose_rotation || (bone.name === 'brim' ? bone.rotation : null);
    const bonePivot = (bone.pivot || [0, 0, 0]).map(v => v / 16);

    for (const cube of bone.cubes || []) {
      const inflate = cube.inflate || 0;
      const [ox, oy, oz] = cube.origin.map(v => v - inflate);
      const [w, h, d] = cube.size.map(v => v + 2 * inflate);
      const [sw, sh, sd] = cube.size;
      const [u, v] = cube.uv;
      
      const [x0, y0, z0] = [ox, oy, oz].map(a => a / 16);
      const [x1, y1, z1] = [ox + w, oy + h, oz + d].map(a => a / 16);

      let rects = {
        east: [u, v + sd, sd, sh],
        north: [u + sd, v + sd, sw, sh],
        west: [u + sd + sw, v + sd, sd, sh],
        south: [u + sd + sw + sd, v + sd, sw, sh],
        up: [u + sd, v, sw, sd],
        down: [u + sd + sw, v, sw, sd]
      };
      
      const isMirrored = !!cube.mirror;
      if (isMirrored) [rects.east, rects.west] = [rects.west, rects.east];

      const faces = {
        east:  [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]],
        west:  [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
        north: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
        south: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
        up:    [[x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [0, 1, 0]],
        down:  [[x1, y0, z1], [x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [0, -1, 0]]
      };

      const cubeRot = cube.rotation || null;
      const cubePivot = (cube.pivot || bone.pivot || [0, 0, 0]).map(a => a / 16);

      for (const faceKey in faces) {
        let [pt1, pt2, pt3, pt4, norm] = faces[faceKey];
        let [ru, rv, rw, rh] = rects[faceKey];
        
        let leftU = ru, rightU = ru + rw;
        if (isMirrored) [leftU, rightU] = [rightU, leftU];
        
        const vertexIndex = positions.length / 3;
        let verts = [pt1, pt2, pt3, pt4];

        if (cubeRot) {
          verts = verts.map(pt => rotateVertex(pt, cubePivot, cubeRot));
          norm = rotateVertex(norm, [0, 0, 0], cubeRot);
        }
        if (boneRot) {
          verts = verts.map(pt => rotateVertex(pt, bonePivot, boneRot));
          norm = rotateVertex(norm, [0, 0, 0], boneRot);
        }

        verts.forEach(p => { positions.push(...p); normals.push(...norm); });
        
        uvs.push(
          leftU / texWidth, 1 - (rv + rh) / texHeight, 
          rightU / texWidth, 1 - (rv + rh) / texHeight, 
          rightU / texWidth, 1 - rv / texHeight, 
          leftU / texWidth, 1 - rv / texHeight
        );
        
        indices.push(
          vertexIndex, vertexIndex + 1, vertexIndex + 2, 
          vertexIndex, vertexIndex + 2, vertexIndex + 3
        );
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  
  return geometry;
}

export function buildNoseGeometry(geoData, style) {
  const geoName = noseGeoName(style);
  if (geoData[geoName]) return buildVillagerGeometry(geoData, () => true, geoName);
  return buildVillagerGeometry(geoData, n => n === 'nose');
}

export function createNoseRig(geoData, material, textures = {}) {
  const defaultNoseGeo = noseGeoName(NOSE_STYLES[0]);
  const headBone = (geoData[defaultNoseGeo]?.bones || geoData['geometry.villager_v2']?.bones || []).find(b => b.name === 'head');
  
  const pivot = (headBone?.pivot || [0, 24, 0]).map(a => a / 16);
  const group = new THREE.Group();
  group.name = 'head';
  group.position.set(pivot[0], pivot[1], pivot[2]);
  
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.name = 'nose';
  mesh.position.set(-pivot[0], -pivot[1], -pivot[2]);
  group.add(mesh);
  
  const cache = new Map();
  const fallbackTexture = material.map;
  let currentStyleIdx = 0;

  const setStyle = (styleIdx) => {
    currentStyleIdx = styleIdx | 0;
    const styleName = NOSE_STYLES[currentStyleIdx] || NOSE_STYLES[0];
    
    if (!cache.has(styleName)) {
      cache.set(styleName, buildNoseGeometry(geoData, styleName));
    }
    
    mesh.geometry = cache.get(styleName);
    const selectedTexture = textures[styleName] || fallbackTexture;
    
    if (material.map !== selectedTexture) { 
      material.map = selectedTexture; 
      material.needsUpdate = true; 
    }
  };

  const refresh = () => setStyle(currentStyleIdx);
  
  return { group, mesh, setStyle, refresh };
}