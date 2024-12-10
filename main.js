async function main() {
  const canvas = document.querySelector("#canvas");
  const gl = canvas.getContext("webgl");
  if (!gl) {
    return;
  }

  const meshProgramInfo = webglUtils.createProgramInfo(gl, [vs, fs]);

  const objHref = 'headphone.obj';  
  const response = await fetch(objHref);
  const text = await response.text();

  const obj = parseOBJ(text);
  const baseHref = new URL(objHref, window.location.href);
  const matTexts = await Promise.all(obj.materialLibs.map(async filename => {
    const matHref = new URL(filename, baseHref).href;
    const response = await fetch(matHref);
    return await response.text();
  }));
  const materials = parseMTL(matTexts.join('\n'));

  // Load textures asynchronously
  const textures = {
    logo: await createTexture(gl, 'logo.png'),
    cushrough: await createTexture(gl, 'cushrough.jpg'),
    cushnormal: await createTexture(gl, 'cushnormal.jpg'),
    speaker: await createTexture(gl, 'speaker.png'),
    defaultWhite: create1PixelTexture(gl, [255, 255, 255, 255]),
  };
  for (const material of Object.values(materials)) {
    Object.entries(material)
      .filter(([key]) => key.endsWith('Map'))
      .forEach(([key, filename]) => {
        let texture = textures[filename];
        if (!texture) {
          const textureHref = new URL(filename, baseHref).href;
          texture = createTexture(gl, textureHref);
          textures[filename] = texture;
        }
        material[key] = texture;
      });
  }

  const materialTextures = {
    Base: {
      diffuseMap: textures.logo,
      shininess: 250,
    },
    "Base.001": {
      diffuse: [0.541176, 0.596078, 0.521569],
      shininess: 250,
    },
    Cush: {
      diffuse: [0.870588, 0.741176, 0.607843],
      normalMap: textures.cushnormal, 
      shininess: 100, 
      specular: [0.2, 0.2, 0.2], 
    },
    Mesh: {
      diffuseMap: textures.speaker,
      shininess: 250,
      specular: [1, 1, 1], // Ensure specular is defined
    },
    Speaker: {
      diffuse: [0.1, 0.1, 0.1],
      shininess: 250,
      specular: [0, 0, 0], // Ensure specular is defined
    },
  };
  

  Object.values(materials).forEach(m => {
    m.shininess = 250;
    m.specular = [1, 1, 1];
  });

  const defaultMaterial = {
    diffuse: [1, 1, 1],
    diffuseMap: textures.defaultWhite,
    ambient: [1, 1, 1],
    specular: [1, 1, 1], // Ensure specular is defined here
    shininess: 1000, // Ensure shininess is defined here
    opacity: 1,
  };
  

  const parts = obj.geometries.map(({ material, data }) => {
    if (data.color) {
      if (data.position.length === data.color.length) {
        data.color = { numComponents: 3, data: data.color };
      }
    } else {
      data.color = { value: [1, 1, 1, 1] };
    }
  
    // Generate tangents if texcoord and normal exist
    if (data.texcoord && data.normal) {
      data.tangent = generateTangents(data.position, data.texcoord, data.indices);
    } else {
      data.tangent = { value: [1, 0, 0] };
    }
  
    // Ensure texcoord and normal exist
    if (!data.texcoord) {
      data.texcoord = { value: [0, 0] };
    }
    if (!data.normal) {
      data.normal = { value: [0, 0, 1] };
    }
  
    // Prepare the buffer info
    const bufferInfo = webglUtils.createBufferInfoFromArrays(gl, data);
  
    // Check if the material has a normal map, and set the normalMap if available
    const materialToUse = {
      ...defaultMaterial,
      ...materialTextures[material],
      normalMap: materialTextures[material]?.normalMap || textures.defaultWhite,
    };    
  
    return {
      material: materialToUse,
      bufferInfo,
    };
  });
  

  const extents = getGeometriesExtents(obj.geometries);
  const range = m4.subtractVectors(extents.max, extents.min);
  const objOffset = m4.scaleVector(
    m4.addVectors(
      extents.min,
      m4.scaleVector(range, 0.5)),
    -1
  );
  const cameraTarget = [0, 0, 0];
  const radius = m4.length(range) * 0.8;  // Reduce the multiplier to bring the camera closer
  const cameraPosition = m4.addVectors(cameraTarget, [0, 0, radius]); 
  const zNear = radius / 100;
  const zFar = radius * 3;
  function degToRad(deg) {
    return deg * Math.PI / 180;
  }
  function render(time) {
    time *= 0.001;
  
    webglUtils.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.enable(gl.DEPTH_TEST);
  
    const fieldOfViewRadians = 60 * Math.PI / 180;
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const projection = m4.perspective(fieldOfViewRadians, aspect, zNear, zFar);
  
    const up = [0, 1, 0];
    const camera = m4.lookAt(cameraPosition, cameraTarget, up);
  
    const view = m4.inverse(camera);
  
    const sharedUniforms = {
      u_lightDirection: m4.normalize([-1, 3, 5]),
      u_view: view,
      u_projection: projection,
      u_viewWorldPosition: cameraPosition,
    };
  
    gl.useProgram(meshProgramInfo.program);
  
    webglUtils.setUniforms(meshProgramInfo, sharedUniforms);
  
    let u_world = m4.yRotation(time);
    u_world = m4.translate(u_world, ...objOffset);
  
    for (const { bufferInfo, material } of parts) {
      webglUtils.setBuffersAndAttributes(gl, meshProgramInfo, bufferInfo);
      webglUtils.setUniforms(meshProgramInfo, { u_world }, material);
      webglUtils.drawBufferInfo(gl, bufferInfo);
    }
  
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

main();
