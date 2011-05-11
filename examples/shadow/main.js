/** -*- compile-command: "jslint-cli main.js" -*-
 *
 *  Copyright (C) 2010-2011 Cedric Pinson
 *
 *                  GNU LESSER GENERAL PUBLIC LICENSE
 *                      Version 3, 29 June 2007
 *
 * Copyright (C) 2007 Free Software Foundation, Inc. <http://fsf.org/>
 * Everyone is permitted to copy and distribute verbatim copies
 * of this license document, but changing it is not allowed.
 *
 * This version of the GNU Lesser General Public License incorporates
 * the terms and conditions of version 3 of the GNU General Public
 * License
 *
 * Authors:
 *  Cedric Pinson <cedric.pinson@plopbyte.com>
 *
 */

// http://www.opengl.org/resources/code/samples/advanced/advanced97/notes/node100.html
function createShadowMatrix(ground, light, shadowMat)
{
    var dot;
    if (shadowMat === undefined) {
        shadowMat = [];
    }

    dot = ground[0] * light[0] +
          ground[1] * light[1] +
          ground[2] * light[2] +
          ground[3] * light[3];
    
    shadowMat[0] = dot - light[0] * ground[0];
    shadowMat[4] = 0.0 - light[0] * ground[1];
    shadowMat[8] = 0.0 - light[0] * ground[2];
    shadowMat[12] = 0.0 - light[0] * ground[3];
    
    shadowMat[1] = 0.0 - light[1] * ground[0];
    shadowMat[5] = dot - light[1] * ground[1];
    shadowMat[9] = 0.0 - light[1] * ground[2];
    shadowMat[13] = 0.0 - light[1] * ground[3];
    
    shadowMat[2] = 0.0 - light[2] * ground[0];
    shadowMat[6] = 0.0 - light[2] * ground[1];
    shadowMat[10] = dot - light[2] * ground[2];
    shadowMat[14] = 0.0 - light[2] * ground[3];
    
    shadowMat[3] = 0.0 - light[3] * ground[0];
    shadowMat[7] = 0.0 - light[3] * ground[1];
    shadowMat[11] = 0.0 - light[3] * ground[2];
    shadowMat[15] = dot - light[3] * ground[3];

    return shadowMat;
}

var LightUpdateCallback = function(matrix) { this.matrix = matrix;};
LightUpdateCallback.prototype = {
    update: function(node, nv) {
        var currentTime = nv.getFrameStamp().getSimulationTime();

        var x = 50 * Math.cos(currentTime);
        var y = 50 * Math.sin(currentTime);
        var h = 80;
        osg.Matrix.makeTranslate(x ,y,h, node.getMatrix());

        createShadowMatrix([0,0,1,5],
                           [x,y,h,1],
                           this.matrix);
        node.light.direction = [x,y,h];
        node.light.dirty();
        node.traverse(nv);
    }
};


var LightUpdateCallbackProjectedTexture = function(matrix, uniform, rtt) { this.matrix = matrix, this.uniform = uniform; this.camera = rtt};
LightUpdateCallbackProjectedTexture.prototype = {
    update: function(node, nv) {
        var currentTime = nv.getFrameStamp().getSimulationTime();

        var x = 50 * Math.cos(currentTime);
        var y = 50 * Math.sin(currentTime);
        var h = 80;
        osg.Matrix.makeTranslate(x ,y,h, node.getMatrix());

        osg.Matrix.makeLookAt([x,y,80],[0,0,-5],[0,-1,0], this.camera.getViewMatrix());

        var biasScale = osg.Matrix.preMult(osg.Matrix.makeTranslate(0.5 , 0.5, 0.5, []), osg.Matrix.makeScale(0.5 , 0.5, 0.5, []));
        var shadowView = this.camera.getViewMatrix();
        var shadowProj = osg.Matrix.copy(this.camera.getProjectionMatrix(), []);
        osg.Matrix.preMult(shadowProj, shadowView);
        osg.Matrix.postMult(biasScale, shadowProj);

        this.uniform.set(shadowProj);
        node.light.direction = [x,y,h];
        node.light.dirty();
        node.traverse(nv);
    }
};

function createProjectedShadowScene()
{
    var model = osgDB.parseSceneGraph(getOgre());
    var root = new osg.MatrixTransform();
    var shadowNode = new osg.MatrixTransform();
    shadowNode.addChild(model);
    var bs = model.getBound();

    var light = new osg.MatrixTransform();
    light.light = new osg.Light();
    light.setUpdateCallback(new LightUpdateCallback(shadowNode.getMatrix()));

    shadowNode.getOrCreateStateSet().setTextureAttributeAndMode(0, new osg.Texture(), osg.StateAttribute.OFF | osg.StateAttribute.OVERRIDE);
    shadowNode.getOrCreateStateSet().setAttributeAndMode(new osg.CullFace('DISABLE'), osg.StateAttribute.OFF | osg.StateAttribute.OVERRIDE);

    root.addChild(model);
    root.addChild(light);
    root.addChild(shadowNode);

    return root;
}


function getTextureProjectedShadowShader()
{
    var vertexshader = [
        "",
        "#ifdef GL_ES",
        "precision highp float;",
        "#endif",
        "attribute vec3 Vertex;",
        "uniform mat4 ModelViewMatrix;",
        "uniform mat4 ProjectionMatrix;",
        "uniform vec4 fragColor;",
        "uniform mat4 WorldMatrix;",
        "uniform mat4 ProjectionShadow;",
        "varying vec4 ShadowUVProjected;",
        "void main(void) {",
        "  gl_Position = ProjectionMatrix * ModelViewMatrix * vec4(Vertex,1.0);",
        "  vec4 uv = (ProjectionShadow * WorldMatrix * vec4(Vertex,1.0));",
        "  ShadowUVProjected = uv;",
        "}",
        ""
    ].join('\n');

    var fragmentshader = [
        "",
        "#ifdef GL_ES",
        "precision highp float;",
        "#endif",
        "uniform vec4 fragColor;",
        "uniform sampler2D Texture0;",
        "varying vec4 ShadowUVProjected;",
        "void main(void) {",
        "  gl_FragColor = texture2DProj( Texture0, ShadowUVProjected);",
        "}",
        ""
    ].join('\n');

    var program = osg.Program.create(
        osg.Shader.create(gl.VERTEX_SHADER, vertexshader),
        osg.Shader.create(gl.FRAGMENT_SHADER, fragmentshader));

    return program;
}

function getBlurrShader()
{
    var vertexshader = [
        "",
        "#ifdef GL_ES",
        "precision highp float;",
        "#endif",
        "attribute vec3 Vertex;",
        "attribute vec2 TexCoord0;",
        "uniform mat4 ModelViewMatrix;",
        "uniform mat4 ProjectionMatrix;",
        "varying vec2 uv0;",
        "void main(void) {",
        "  gl_Position = ProjectionMatrix * ModelViewMatrix * vec4(Vertex,1.0);",
        "  uv0 = TexCoord0;",
        "}",
        ""
    ].join('\n');

    var fragmentshader = [
        "",
        "#ifdef GL_ES",
        "precision highp float;",
        "#endif",
        "uniform sampler2D Texture0;",
        "varying vec2 uv0;",
        "float shift = 1.0/512.0;",
        "vec4 getSmoothTexelFilter(vec2 uv) {",
        "  vec4 c = texture2D( Texture0,  uv);",
        "  c += texture2D( Texture0, uv+vec2(0,shift));",
        "  c += texture2D( Texture0, uv+vec2(shift,shift));",
        "  c += texture2D( Texture0, uv+vec2(shift,0));",
        "  c += texture2D( Texture0, uv+vec2(shift,-shift));",
        "  c += texture2D( Texture0, uv+vec2(0,-shift));",
        "  c += texture2D( Texture0, uv+vec2(-shift,-shift));",
        "  c += texture2D( Texture0, uv+vec2(-shift,0));",
        "  c += texture2D( Texture0, uv+vec2(-shift,shift));",
        "  return c/9.0;",
        "}",
        "void main(void) {",
        "   gl_FragColor = getSmoothTexelFilter( uv0);",
        "}",
        ""
    ].join('\n');

    var program = osg.Program.create(
        osg.Shader.create(gl.VERTEX_SHADER, vertexshader),
        osg.Shader.create(gl.FRAGMENT_SHADER, fragmentshader));

    return program;
}

function createTextureProjectedShadowScene()
{
    var model = osgDB.parseSceneGraph(getOgre());
    var root = new osg.MatrixTransform();
    var shadowNode = new osg.MatrixTransform();
    shadowNode.addChild(model);
    var bs = model.getBound();

    var light = new osg.MatrixTransform();
    var rtt = new osg.Camera();
    rtt.setName("rtt_camera");
    rttSize = [512,512];
    
    rtt.setProjectionMatrix(osg.Matrix.makePerspective(15, 1, 1.0, 1000.0));
    var lightMatrix = [];
    rtt.setViewMatrix(osg.Matrix.makeLookAt([0,0,80],[0,0,0],[0,1,0]));
    rtt.setRenderOrder(osg.Camera.PRE_RENDER, 0);
    rtt.setReferenceFrame(osg.Transform.ABSOLUTE_RF);
    rtt.setViewport(new osg.Viewport(0,0,rttSize[0],rttSize[1]));
    rtt.setClearColor([0, 0, 0, 0.0]);

    var matDark = new osg.Material();
    var black = [0,0,0,1];
    matDark.ambient = black;
    matDark.diffuse = black;
    matDark.specular = black;
    shadowNode.getOrCreateStateSet().setAttributeAndMode(matDark, osg.StateAttribute.ON | osg.StateAttribute.OVERRIDE);

    var rttTexture = new osg.Texture();
    rttTexture.setTextureSize(rttSize[0],rttSize[1]);
    rttTexture.setMinFilter('LINEAR');
    rttTexture.setMagFilter('LINEAR');
    rtt.attachTexture(gl.COLOR_ATTACHMENT0, rttTexture, 0);
    rtt.addChild(shadowNode);
    light.addChild(rtt);

    var shadowMatrix = [];
    light.light = new osg.Light();

    var q = osg.createTexturedQuad(-10,-10,-4.99,
                                  20, 0 ,0,
                                  0, 20 ,0);
    q.getOrCreateStateSet().setAttributeAndMode(new osg.Material(), osg.StateAttribute.OFF);
    q.getOrCreateStateSet().setAttributeAndMode(new osg.BlendFunc('ONE', 'ONE_MINUS_SRC_ALPHA'));
    q.getOrCreateStateSet().setTextureAttributeAndMode(0, rttTexture);
    q.getOrCreateStateSet().setAttributeAndMode(getTextureProjectedShadowShader());
    var uniform = new osg.Uniform.createMatrix4(osg.Matrix.makeIdentity(), "ProjectionShadow");
    q.getOrCreateStateSet().addUniform(uniform);
    var world = new osg.Uniform.createMatrix4(osg.Matrix.makeTranslate(0,0,0, []), "WorldMatrix");
    q.getOrCreateStateSet().addUniform(world);
    light.setUpdateCallback(new LightUpdateCallbackProjectedTexture(shadowMatrix, 
                                                                    uniform,
                                                                    rtt));

    var blurr = new osg.Camera();
    blurr.setProjectionMatrix(osg.Matrix.makeOrtho(0, rttSize[0], 0, rttSize[1], -5, 5));
    blurr.setRenderOrder(osg.Camera.PRE_RENDER, 0);
    blurr.setReferenceFrame(osg.Transform.ABSOLUTE_RF);
    blurr.setViewport(new osg.Viewport(0,0,rttSize[0],rttSize[1]));
    var quad = osg.createTexturedQuad(0,0,0,
                                      rttSize[0], 0 ,0,
                                      0, rttSize[1],0);
    quad.getOrCreateStateSet().setTextureAttributeAndMode(0, rttTexture);
    quad.getOrCreateStateSet().setAttributeAndMode(getBlurrShader());
    var blurredTexture = new osg.Texture();
    blurredTexture.setTextureSize(rttSize[0],rttSize[1]);
    blurredTexture.setMinFilter('LINEAR');
    blurredTexture.setMagFilter('LINEAR');
    blurr.attachTexture(gl.COLOR_ATTACHMENT0, blurredTexture, 0);
    blurr.addChild(quad);

    // the one used for the final
    q.getOrCreateStateSet().setTextureAttributeAndMode(0, blurredTexture);
    
    root.addChild(model);
    root.addChild(light);
    root.addChild(blurr);
    root.addChild(q);

    return root;
}



function getShadowMapShaderLight()
{
    var vertexshader = [
        "",
        "#ifdef GL_ES",
        "precision highp float;",
        "#endif",
        "attribute vec3 Vertex;",
        "uniform mat4 ModelViewMatrix;",
        "uniform mat4 ProjectionMatrix;",
        "varying float z;",
        "void main(void) {",
        "  gl_Position = ProjectionMatrix * ModelViewMatrix * vec4(Vertex,1.0);",
        "  z = (ModelViewMatrix * vec4(Vertex,1.0)).z;",
        "}",
        ""
    ].join('\n');

    var fragmentshader = [
        "",
        "#ifdef GL_ES",
        "precision highp float;",
        "#endif",
        "varying float z;",
        "uniform float nearShadow;",
        "uniform float farShadow;",
        "vec4 pack(float value){",
        "    float depth = value;",
        "    float depth1 = depth*255.0*255.0;",
        "    float depth2 = (depth*depth)*255.0*255.0;",
        "    return vec4(",
        "        mod(depth1, 255.0)/255.0,",
        "        floor(depth1/255.0)/255.0,",
        "        mod(depth2, 255.0)/255.0,",
        "        floor(depth2/255.0)/255.0",
        "    );",
        "}",
        "void main(void) {",
        "  gl_FragColor = pack(((-z) - nearShadow)/ (farShadow-nearShadow));",
        "}",
        ""
    ].join('\n');

    var program = osg.Program.create(
        osg.Shader.create(gl.VERTEX_SHADER, vertexshader),
        osg.Shader.create(gl.FRAGMENT_SHADER, fragmentshader));

    return program;
}

function getShadowMapShaderGround()
{
    var vertexshader = [
        "",
        "#ifdef GL_ES",
        "precision highp float;",
        "#endif",
        "attribute vec2 TexCoord0;",
        "attribute vec3 Vertex;",
        "uniform mat4 ModelViewMatrix;",
        "uniform mat4 ProjectionMatrix;",
        "uniform mat4 ProjectionShadow;",
        "uniform mat4 ModelViewShadow;",
        "varying float z;",
        "varying vec4 uv;",
        "varying vec2 uv0;",
        "varying vec3 vertex;",
        "//varying vec4 shadowPosition;",
        "uniform float nearShadow;",
        "uniform float farShadow;",
        "void main(void) {",
        "  gl_Position = ProjectionMatrix * ModelViewMatrix * vec4(Vertex,1.0);",
        "  //shadowPosition = ModelViewShadow * vec4(Vertex,1.0);",
        "  //uv = ProjectionShadow * shadowPosition;",
        "  vertex = Vertex;",
        "  uv0 = TexCoord0;",
        "}",
        ""
    ].join('\n');

    var fragmentshader = [
        "",
        "#ifdef GL_ES",
        "precision highp float;",
        "#endif",
        "//varying vec4 uv;",
        "varying vec2 uv0;",
        "varying vec3 vertex;",
        "//varying vec4 shadowPosition;",
        "uniform sampler2D Texture0;",
        "uniform float nearShadow;",
        "uniform float farShadow;",
        "uniform mat4 ProjectionShadow;",
        "uniform mat4 ModelViewShadow;",
        "vec2 unpack(vec4 src){",
        "    return vec2(",
        "    src.x/255.0+src.y,",
        "        src.z/255.0+src.w",
        ");",
        "}",
        "void main(void) {",
        "  vec4 shadowPosition = ModelViewShadow * vec4(vertex,1.0);",
        "  vec4 uv = ProjectionShadow * shadowPosition;",
        "  vec3 shadowCoord = uv.xyz/uv.w;",
        "  float debug = 0.0;",
        "  float z = (-shadowPosition.z - nearShadow)/(farShadow-nearShadow);",

        "  vec2 moments = unpack(texture2D(Texture0, shadowCoord.xy));",
        "  float depth = moments.x;",

        "  float visibility  = ((depth - z) > -0.0001) ? (1.0) : (0.0);",
        "  //gl_FragColor = vec4(visibility,visibility,visibility,1);",
        "  gl_FragColor = vec4(0,0,0,1.0-visibility);",
        "  //float debug = unpackVec4ToFloat(texture2D(Texture0, uv0));",
        "  //z = unpackVec4ToFloat(texture2D(Texture0, uv0));",
        "  //debug = depth;",
        "  //gl_FragColor = vec4(debug,debug,debug,1);",
        "}",
        ""
    ].join('\n');

    var program = osg.Program.create(
        osg.Shader.create(gl.VERTEX_SHADER, vertexshader),
        osg.Shader.create(gl.FRAGMENT_SHADER, fragmentshader));

    return program;
}

function getShadowMapBlurShader()
{
    var vertexshader = [
        "",
        "#ifdef GL_ES",
        "precision highp float;",
        "#endif",
        "attribute vec3 Vertex;",
        "attribute vec2 TexCoord0;",
        "uniform mat4 ModelViewMatrix;",
        "uniform mat4 ProjectionMatrix;",
        "varying vec2 uv0;",
        "void main(void) {",
        "  gl_Position = ProjectionMatrix * ModelViewMatrix * vec4(Vertex,1.0);",
        "  uv0 = TexCoord0;",
        "}",
        ""
    ].join('\n');

    var fragmentshader = [
        "",
        "#ifdef GL_ES",
        "precision highp float;",
        "#endif",
        "uniform sampler2D Texture0;",
        "varying vec2 uv0;",
        "float shift = 2.0/512.0;",
        "vec2 unpack(vec4 src){",
        "    return vec2(",
        "    src.x/255.0+src.y,",
        "        src.z/255.0+src.w",
        ");",
        "}",
        "vec4 pack(float value){",
        "    float depth = value;",
        "    float depth1 = depth*255.0*255.0;",
        "    float depth2 = (depth*depth)*255.0*255.0;",
        "    return vec4(",
        "        mod(depth1, 255.0)/255.0,",
        "        floor(depth1/255.0)/255.0,",
        "        mod(depth2, 255.0)/255.0,",
        "        floor(depth2/255.0)/255.0",
        "    );",
        "}",
        "float getSmoothTexelFilter(vec2 uv) {",
        "  float c = unpack(texture2D( Texture0,  uv)).x;",
        "  c += unpack(texture2D( Texture0, uv+vec2(0,shift))).x;",
        "  c += unpack(texture2D( Texture0, uv+vec2(shift,shift))).x;",
        "  c += unpack(texture2D( Texture0, uv+vec2(shift,0))).x;",
        "  c += unpack(texture2D( Texture0, uv+vec2(shift,-shift))).x;",
        "  c += unpack(texture2D( Texture0, uv+vec2(0,-shift))).x;",
        "  c += unpack(texture2D( Texture0, uv+vec2(-shift,-shift))).x;",
        "  c += unpack(texture2D( Texture0, uv+vec2(-shift,0))).x;",
        "  c += unpack(texture2D( Texture0, uv+vec2(-shift,shift))).x;",
        "  return c/9.0;",
        "}",
        "void main(void) {",
        "   gl_FragColor = pack(getSmoothTexelFilter( uv0));",
        "}",
        ""
    ].join('\n');

    var program = osg.Program.create(
        osg.Shader.create(gl.VERTEX_SHADER, vertexshader),
        osg.Shader.create(gl.FRAGMENT_SHADER, fragmentshader));

    return program;
}

var LightUpdateCallbackShadowMap = function(projectionShadow, modelviewShadow, rtt) { this.projectionShadow = projectionShadow, this.modelviewShadow = modelviewShadow; this.camera = rtt};
LightUpdateCallbackShadowMap.prototype = {
    update: function(node, nv) {
        var currentTime = nv.getFrameStamp().getSimulationTime();

        var x = 50 * Math.cos(currentTime);
        var y = 50 * Math.sin(currentTime);
        var h = 80;
        osg.Matrix.makeTranslate(x ,y,h, node.getMatrix());

        osg.Matrix.makeLookAt([x,y,80],[0,0,-5],[0,-1,0], this.camera.getViewMatrix());

        var biasScale = osg.Matrix.preMult(osg.Matrix.makeTranslate(0.5 , 0.5, 0.5, []), osg.Matrix.makeScale(0.5 , 0.5, 0.5, []));
        var shadowProj = osg.Matrix.copy(this.camera.getProjectionMatrix(), []);
        osg.Matrix.postMult(biasScale, shadowProj);

        // need model matrix
        var shadowView = this.camera.getViewMatrix();

        this.projectionShadow.set(shadowProj);
        this.modelviewShadow.set(shadowView);
        node.light.direction = [x,y,h];
        node.light.dirty();
        node.traverse(nv);
    }
};

function createShadowMapScene() 
{
    var model = osgDB.parseSceneGraph(getOgre());
    var root = new osg.MatrixTransform();
    var shadowNode = new osg.MatrixTransform();
    shadowNode.addChild(model);
    var bs = model.getBound();

    var light = new osg.MatrixTransform();
    var rtt = new osg.Camera();
    rtt.setName("rtt_camera");
    rttSize = [512,512];
    
    // important because we use linear zbuffer
    var near = 60.0;
    var far = 120.0;

    var nearShadow = new osg.Uniform.createFloat1(near, "nearShadow");
    var farShadow = new osg.Uniform.createFloat1(far, "farShadow" );

    var projectionShadow = new osg.Uniform.createMatrix4(osg.Matrix.makeIdentity(), "ProjectionShadow");
    var modelViewShadow = new osg.Uniform.createMatrix4(osg.Matrix.makeIdentity(), "ModelViewShadow");

    rtt.setProjectionMatrix(osg.Matrix.makePerspective(15, 1, near, far));
    var lightMatrix = [];
    rtt.setViewMatrix(osg.Matrix.makeLookAt([0,0,80],[0,0,0],[0,1,0]));
    rtt.setRenderOrder(osg.Camera.PRE_RENDER, 0);
    rtt.setReferenceFrame(osg.Transform.ABSOLUTE_RF);
    rtt.setViewport(new osg.Viewport(0,0,rttSize[0],rttSize[1]));
    rtt.setClearColor([1, 1, 1, 0.0]);

    shadowNode.getOrCreateStateSet().setAttributeAndMode(getShadowMapShaderLight(), osg.StateAttribute.ON | osg.StateAttribute.OVERRIDE);
    shadowNode.getOrCreateStateSet().addUniform(nearShadow);
    shadowNode.getOrCreateStateSet().addUniform(farShadow);

    var rttTexture = new osg.Texture();
    rttTexture.setTextureSize(rttSize[0],rttSize[1]);
    rttTexture.setMinFilter('NEAREST');
    rttTexture.setMagFilter('NEAREST');
    rtt.attachTexture(gl.COLOR_ATTACHMENT0, rttTexture, 0);
    rtt.attachRenderBuffer(gl.DEPTH_ATTACHMENT, gl.DEPTH_COMPONENT16);
    rtt.addChild(shadowNode);
    light.addChild(rtt);

    var shadowMatrix = [];
    light.light = new osg.Light();

    var q = osg.createTexturedQuad(-10,-10,-4.98,
                                  20, 0 ,0,
                                  0, 20 ,0);
    q.getOrCreateStateSet().setAttributeAndMode(new osg.BlendFunc('ONE', 'ONE_MINUS_SRC_ALPHA'));
    q.getOrCreateStateSet().setTextureAttributeAndMode(0, rttTexture);
    q.getOrCreateStateSet().setAttributeAndMode( getShadowMapShaderGround());
    q.getOrCreateStateSet().addUniform(projectionShadow);
    q.getOrCreateStateSet().addUniform(modelViewShadow);
    q.getOrCreateStateSet().addUniform(nearShadow);
    q.getOrCreateStateSet().addUniform(farShadow);
    light.setUpdateCallback(new LightUpdateCallbackShadowMap(projectionShadow,
                                                             modelViewShadow,
                                                             rtt));
    var doblur = true;
    if (doblur) {
        var blur = new osg.Camera();
        blur.setProjectionMatrix(osg.Matrix.makeOrtho(0, rttSize[0], 0, rttSize[1], -5, 5));
        blur.setRenderOrder(osg.Camera.PRE_RENDER, 0);
        blur.setReferenceFrame(osg.Transform.ABSOLUTE_RF);
        blur.setViewport(new osg.Viewport(0,0,rttSize[0],rttSize[1]));
        var quad = osg.createTexturedQuad(0,0,0,
                                          rttSize[0], 0 ,0,
                                          0, rttSize[1],0);
        quad.getOrCreateStateSet().setTextureAttributeAndMode(0, rttTexture);
        quad.getOrCreateStateSet().setAttributeAndMode(getShadowMapBlurShader());
        var bluredTexture = new osg.Texture();
        bluredTexture.setTextureSize(rttSize[0],rttSize[1]);
        bluredTexture.setMinFilter('NEAREST');
        bluredTexture.setMagFilter('NEAREST');
        blur.attachTexture(gl.COLOR_ATTACHMENT0, bluredTexture, 0);
        blur.addChild(quad);

        // the one used for the final
        q.getOrCreateStateSet().setTextureAttributeAndMode(0, bluredTexture);
    }

    root.addChild(model);
    root.addChild(light);
    if (doblur) {
        root.addChild(blur);
    }
    root.addChild(q);

    return root;
}

function createScene() {
    var root = new osg.Camera();
    root.setComputeNearFar(false);

    var project = createProjectedShadowScene();
    project.setMatrix(osg.Matrix.makeTranslate(-10,0,0,[]));
    root.addChild(project);

    if (false) {
        var texproject = createTextureProjectedShadowScene();
        texproject.setMatrix(osg.Matrix.makeTranslate(0,0,0,[]));
        root.addChild(texproject);
    }

    var shadowmap = createShadowMapScene();
    shadowmap.setMatrix(osg.Matrix.makeTranslate(0,0,0,[]));
    root.addChild(shadowmap);

    return root;
}

function createSceneBox() {
    return osg.createTexturedBox(0,0,0,
                                 40, 60, 40);
}
