import P from 'bluebird';
import requestFile from 'osgDB/requestFile';
import Input from 'osgDB/Input';
import Registry from 'osgDB/Registry';
import animation from 'osgAnimation/animation';
import BasicAnimationManager from 'osgAnimation/BasicAnimationManager';
import Skeleton from 'osgAnimation/Skeleton';
import Bone from 'osgAnimation/Bone';
import StackedTranslate from 'osgAnimation/StackedTranslate';
import StackedQuaternion from 'osgAnimation/StackedQuaternion';
import StackedScale from 'osgAnimation/StackedScale';
import RigGeometry from 'osgAnimation/RigGeometry';
import MorphGeometry from 'osgAnimation/MorphGeometry';
import channelFactory from 'osgAnimation/channel';
var createQuatChannel = channelFactory.createQuatChannel;
var createVec3Channel = channelFactory.createVec3Channel;
var createFloatChannel = channelFactory.createFloatChannel;
import animationFactory from 'osgAnimation/animation';
import BlendFunc from 'osg/BlendFunc';
import notify from 'osg/notify';

import Node from 'osg/Node';
import Geometry from 'osg/Geometry';
import Texture from 'osg/Texture';
import MatrixTransform from 'osg/MatrixTransform';
import Material from 'osg/Material';
import DrawElements from 'osg/DrawElements';
import primitiveSet from 'osg/primitiveSet';
import BufferArray from 'osg/BufferArray';
import UpdateBone from 'osgAnimation/UpdateBone';
import UpdateMatrixTransform from 'osgAnimation/UpdateMatrixTransform';
import FileHelper from 'osgDB/FileHelper';

import Uniform from 'osg/Uniform';
import {vec3} from 'osg/glMatrix';
import {quat} from 'osg/glMatrix';
import {mat4} from 'osg/glMatrix';

var ReaderWriterGLTF = function() {
    // Contains all the needed glTF files (.gltf, .bin, etc...)
    this._filesMap = undefined;
    this._loadedFiles = undefined;
    this._bufferViewCache = undefined;
    this._basicAnimationManager = undefined;
    this._visitedNodes = undefined;
    this._animatedNodes = undefined;
    this._skeletons = undefined;
    this._bones = undefined;
    this._skeletonToInfluenceMap = undefined;
    this._inputImgReader = undefined;
    this._localPath = '';

    this.init();
};

function base64ToArrayBuffer(base64) {
    var binary_string = window.atob(base64);
    var len = binary_string.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

ReaderWriterGLTF.WEBGL_COMPONENT_TYPES = {
    5120: Int8Array,
    5121: Uint8Array,
    5122: Int16Array,
    5123: Uint16Array,
    5125: Uint32Array,
    5126: Float32Array
};

ReaderWriterGLTF.TYPE_TABLE = {
    SCALAR: 1,
    VEC2: 2,
    VEC3: 3,
    VEC4: 4,
    MAT2: 4,
    MAT3: 9,
    MAT4: 16
};

ReaderWriterGLTF.ATTRIBUTE_OSGJS_TABLE = {
    POSITION: 'Vertex',
    NORMAL: 'Normal',
    TANGENT: 'Tangent',
    TEXCOORD_0: 'TexCoord0',
    TEXCOORD_1: 'TexCoord1',
    TEXCOORD_2: 'TexCoord2',
    TEXCOORD_3: 'TexCoord3',
    TEXCOORD_4: 'TexCoord4',
    TEXCOORD_5: 'TexCoord5',
    TEXCOORD_6: 'TexCoord6',
    TEXCOORD_7: 'TexCoord7',
    TEXCOORD_8: 'TexCoord8',
    TEXCOORD_9: 'TexCoord9',
    TEXCOORD_10: 'TexCoord10',
    TEXCOORD_11: 'TexCoord11',
    TEXCOORD_12: 'TexCoord12',
    TEXCOORD_13: 'TexCoord13',
    TEXCOORD_14: 'TexCoord14',
    TEXCOORD_15: 'TexCoord15',
    COLOR_0: 'Color',
    JOINTS_0: 'Bones',
    WEIGHT_0: 'Weights'
};

ReaderWriterGLTF.TEXTURE_FORMAT = {
    6406: Texture.ALPHA,
    6407: Texture.RGB,
    6408: Texture.RGBA,
    6409: Texture.LUMINANCE,
    6410: Texture.LUMINANCE_ALPHA
};

ReaderWriterGLTF.TYPE_CHANNEL_PATH = {
    translation: {
        VEC3: createVec3Channel
    },
    scale: {
        VEC3: createVec3Channel
    },
    rotation: {
        VEC4: createQuatChannel
    },
    weights: {
        SCALAR: createFloatChannel
    }
};

ReaderWriterGLTF.PBR_SPEC_EXT = 'KHR_materials_pbrSpecularGlossiness';
ReaderWriterGLTF.PBR_SPEC_MODE = 'PBR_specular_glossiness';
ReaderWriterGLTF.PBR_METAL_MODE = 'PBR_metal_roughness';

ReaderWriterGLTF.ALBEDO_TEXTURE_UNIT = 2;
ReaderWriterGLTF.DIFFUSE_TEXTURE_UNIT = 2;
ReaderWriterGLTF.SPECULAR_GLOSSINESS_TEXTURE_UNIT = 3;
ReaderWriterGLTF.METALLIC_ROUGHNESS_TEXTURE_UNIT = 3;
ReaderWriterGLTF.SPECULAR_TEXTURE_UNIT = 4;
ReaderWriterGLTF.NORMAL_TEXTURE_UNIT = 5;
ReaderWriterGLTF.AO_TEXTURE_UNIT = 6;
ReaderWriterGLTF.EMISSIVE_TEXTURE_UNIT = 7;

ReaderWriterGLTF.ALBEDO_UNIFORM = 'albedoMap';
ReaderWriterGLTF.METALLIC_ROUGHNESS_UNIFORM = 'metallicRoughnessMap';
ReaderWriterGLTF.SPECULAR_UNIFORM = 'specularMap';
ReaderWriterGLTF.NORMAL_UNIFORM = 'normalMap';
ReaderWriterGLTF.AO_UNIFORM = 'aoMap';
ReaderWriterGLTF.EMISSIVE_UNIFORM = 'emissiveMap';

ReaderWriterGLTF.prototype = {
    init: function() {
        this._glTFJSON = undefined;
        this._bufferViewCache = {};
        this._basicAnimationManager = undefined;
        this._localPath = '';
        this._visitedNodes = {};
        this._animatedNodes = {};
        this._skeletons = {};
        this._bones = {};
        this._skeletonToInfluenceMap = {};
        this._stateSetMap = {};
        this._filesMap = new window.Map();
        this._inputReader = new Input();
    },

    loadBuffers: P.method(function() {
        var promises = [];
        var buffers = this._gltfJSON.buffers;
        for (var i = 0; i < buffers.length; i++) {
            var buffer = buffers[i];
            promises.push(
                this.loadURI(buffer.uri).then(function(arrayBuffer) {
                    buffer.data = arrayBuffer;
                })
            );
        }
        return P.all(promises);
    }),

    loadBufferViews: function() {
        var buffers = this._gltfJSON.buffers;
        var bufferViews = this._gltfJSON.bufferViews;
        for (var i = 0; i < bufferViews.length; i++) {
            var bufferView = bufferViews[i];
            var bufferIndex = bufferView.buffer;
            var buffer = buffers[bufferIndex];
            var byteLength = bufferView.byteLength || 0;
            var byteOffset = bufferView.byteOffset || 0;
            bufferView.data = buffer.data.slice(byteOffset, byteOffset + byteLength);
        }
    },

    loadAccessors: function() {
        var bufferViews = this._gltfJSON.bufferViews;
        var accessors = this._gltfJSON.accessors;
        for (var i = 0; i < accessors.length; i++) {
            var accessor = accessors[i];
            var bufferViewIndex = accessor.bufferView;
            var bufferView = bufferViews[bufferViewIndex];

            var itemSize = ReaderWriterGLTF.TYPE_TABLE[accessor.type];
            var TypedArray = ReaderWriterGLTF.WEBGL_COMPONENT_TYPES[accessor.componentType];

            // For VEC3: itemSize is 3, elementBytes is 4, itemBytes is 12.
            var elementBytes = TypedArray.BYTES_PER_ELEMENT;
            var itemBytes = elementBytes * itemSize;
            var byteStride = bufferView.byteStride;
            var normalized = accessor.normalized === true;
            var bufferArray;

            // The buffer is not interleaved if the stride is the item size in bytes.
            if (byteStride && byteStride !== itemBytes) {
                // Use the full buffer if it's interleaved.
                notify.warn('GLTF interleaved accessors not supported');
            } else {
                var data = new TypedArray(
                    bufferView.data,
                    accessor.byteOffset,
                    accessor.count * itemSize
                );
                bufferArray = new BufferArray(undefined, data, itemSize);
                bufferArray.setNormalize(normalized);
            }
            accessor.data = bufferArray;
        }
    },

    _computeNodeMatrix: function(node) {
        var matrix;
        if (node.matrix) {
            matrix = mat4.clone(node.matrix);
        } else if (node.translation || node.rotation || node.scale) {
            var translation = mat4.IDENTITY;
            var rotation = mat4.IDENTITY;
            var scale = mat4.IDENTITY;
            if (node.translation)
                translation = mat4.fromTranslation(mat4.create(), node.translation);
            if (node.rotation) rotation = mat4.fromQuat(mat4.create(), node.rotation);
            if (node.scale) scale = mat4.fromScaling(mat4.create(), node.scale);
            matrix = mat4.create();
            mat4.multiply(matrix, rotation, scale);
            mat4.multiply(matrix, translation, matrix);
        }
        return matrix;
    },

    loadNodes: function() {
        var nodes = this._gltfJSON.nodes;
        var meshes = this._gltfJSON.meshes;

        // create all nodes
        // children relationship will be done in loadScenes
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];

            if (node.osgjsSkeleton || node.osgjsBone) {
                node.osgjsNode = node.osgjsSkeleton || node.osgjsBone;
                node.osgjsNode.setMatrix(this._computeNodeMatrix(node));
            } else if (node.matrix || node.translation || node.rotation || node.scale) {
                node.osgjsNode = new MatrixTransform();
                node.osgjsNode.setMatrix(this._computeNodeMatrix(node));
            } else if (node.mesh !== undefined) {
                node.osgjsNode = meshes[node.mesh].osgjsGeometry;
            } else {
                node.osgjsNode = new Node();
            }
        }
    },

    _processSkeleton: function(skinID) {
        var skins = this._gltfJSON.skins;
        var skin = skins[skinID];
        var bones = skin.joints;
    },

    _linkNodes: function(parent) {
        var nodes = this._gltfJSON.nodes;
        var children = parent.children;
        if (!children) return;

        for (var i = 0; i < children.length; i++) {
            var node = nodes[children[i]];
            var osgjsChild = node.osgjsNode;
            if (!parent.osgjsNode.hasChild(osgjsChild)) {
                parent.osgjsNode.addChild(osgjsChild);
                this._linkNodes(node);
            }
        }
    },

    // children relationship will be done in loadScenes
    loadScenes: function() {
        var nodes = this._gltfJSON.nodes;
        var scenes = this._gltfJSON.scenes;

        this._osgjsScene = [];

        // create all nodes
        // children relationship will be done in loadScenes
        for (var i = 0; i < scenes.length; i++) {
            var scene = scenes[i];
            var sceneNodes = scene.nodes;
            var rootNodes = [];
            for (var j = 0; j < sceneNodes.length; j++) {
                var node = nodes[sceneNodes[j]];
                this._linkNodes(node);
                rootNodes.push(node.osgjsNode);
            }

            var root = rootNodes[0];
            if (rootNodes.length > 1) {
                root = new Node();
                for (var r = 0; r < rootNodes.length; r++) {
                    root.addChild(rootNodes[r]);
                }
            }
            this._osgjsScene.push(root);
        }
    },

    _assignGeometryAttributes: function(osgjsGeometry, gltfAttributes, index) {
        var accessors = this._gltfJSON.accessors;
        var keys = window.Object.keys(gltfAttributes);
        for (var i = 0; i < keys.length; i++) {
            var attribute = keys[i];
            var accessorIndex = gltfAttributes[attribute];
            var accessor = accessors[accessorIndex];
            var osgjsAttributeName = ReaderWriterGLTF.ATTRIBUTE_OSGJS_TABLE[attribute];
            if (index !== undefined) osgjsAttributeName += '_' + index.toString();
            osgjsGeometry.getVertexAttributeList()[osgjsAttributeName] = accessor.data;
            accessor.data._target = BufferArray.ARRAY_BUFFER;
        }
    },

    _assignGeometryPrimitives: function(osgjsGeometry, primitive) {
        var accessors = this._gltfJSON.accessors;
        var indexes = accessors[primitive.indices];
        indexes.data._target = BufferArray.ELEMENT_ARRAY_BUFFER;
        var primitiveMode = primitive.mode !== undefined ? primitive.mode : primitiveSet.TRIANGLES;
        var osgPrimitive = new DrawElements(primitiveMode, indexes.data);
        osgjsGeometry.getPrimitiveSetList().push(osgPrimitive);
    },

    loadMeshes: function() {
        var meshes = this._gltfJSON.meshes;

        for (var i = 0; i < meshes.length; i++) {
            var mesh = meshes[i];
            var osgjsGeometries = [];
            for (var j = 0; j < mesh.primitives.length; j++) {
                var geometry;
                var primitive = mesh.primitives[j];
                // means we have morph
                if (primitive.targets && primitive.targets.length) {
                    geometry = new MorphGeometry();
                    for (var t = 0; t < primitive.targets.length; t++) {
                        var morphTarget = new Geometry();
                        this._assignGeometryAttributes(morphTarget, primitive.targets[t], t);
                        geometry.getMorphTargets().push(morphTarget);
                    }
                    this._assignGeometryAttributes(geometry, primitive.attributes);
                    this._assignGeometryPrimitives(geometry, primitive);
                    geometry.mergeChildrenVertexAttributeList();
                }

                if (primitive.attributes.JOINTS_0) {
                    var rigGeometry = new RigGeometry();
                    if (!geometry) {
                        geometry = new Geometry();
                        this._assignGeometryAttributes(geometry, primitive.attributes);
                        this._assignGeometryPrimitives(geometry, primitive);
                    }
                    rigGeometry.setSourceGeometry(geometry);
                    rigGeometry.mergeChildrenData();
                    geometry = rigGeometry;
                }

                if (!geometry) {
                    geometry = new Geometry();
                    this._assignGeometryAttributes(geometry, primitive.attributes);
                    this._assignGeometryPrimitives(geometry, primitive);
                }
                osgjsGeometries.push(geometry);
            }

            if (osgjsGeometries.length > 1) {
                var node = new Node();
                for (var c = 0; c < osgjsGeometries.length; c++) node.addChild(osgjsGeometries[c]);
                geometry = node;
            }
            mesh.osgjsGeometry = geometry;
        }
    },

    _texture: function() {
        if (!glTFTextureObject) return;
        var json = this._glTFJSON;
        var glTFTexture = json.textures[glTFTextureObject.index];
        if (!glTFTexture) return;

        var image = json.images[glTFTexture.source];

        if (!image) return;
        var texture = new Texture();
        // GLTF texture origin is correct
        texture.setFlipY(false);
        texture.setWrapS('REPEAT');
        texture.setWrapT('REPEAT');

        this.loadFile(image.uri).then(function(data) {
            if (!data) return;
            texture.setImage(data, ReaderWriterGLTF.TEXTURE_FORMAT[glTFTexture.format]);
            stateSet.setTextureAttributeAndModes(location, texture);
            if (uniform) {
                stateSet.addUniform(Uniform.createInt(location, uniform));
            }
            return;
        });
    },

    _pbrMetallicRoughnessTextureUniforms: function() {
        var stateSet = this._stateSetTextureUnit;
        var albedo = Uniform.createInt(
            ReaderWriterGLTF.ALBEDO_TEXTURE_UNIT,
            ReaderWriterGLTF.ALBEDO_UNIFORM
        );
        var metalnessRoughness = Uniform.createInt(
            ReaderWriterGLTF.METALLIC_ROUGHNESS_TEXTURE_UNIT,
            ReaderWriterGLTF.METALLIC_ROUGHNESS_UNIFORM
        );
        stateSet.addUniform(albedo);
        stateSet.addUniform(metalnessRoughness);
    },

    _pbrMetallicRoughness: function(material, stateSet) {
        var texture;

        // baseColor
        if (material.baseColorTexture) {
            texture = this._texture(material.baseColorTexture);
            stateSet.setTextureAttributeAndModes(ReaderWriterGLTF.ALBEDO_TEXTURE_UNIT, texture);
        } else if (material.baseColorFactor) {
            //PBR default uniforms
            var color = Uniform.createFloat4(material.baseColorFactor, 'uBaseColorFactor');
            stateSet.addUniform(color);
        }

        // metallic
        if (material.metallicFactor !== undefined) {
            var metallic = Uniform.createFloat1(material.metallicFactor, 'uMetallicFactor');
            stateSet.addUniform(metallic);
        }

        if (material.roughnessFactor !== undefined) {
            var roughness = Uniform.createFloat1(material.roughnessFactor, 'uRoughnessFactor');
            stateSet.addUniform(roughness);
        }

        if (material.metallicRoughnessTexture) {
            texture = this._texture(material.metallicRoughnessTexture);
            stateSet.setTextureAttributeAndModes(
                ReaderWriterGLTF.METALLIC_ROUGHNESS_TEXTURE_UNIT,
                texture
            );
        }
    },

    _KHR_materials_pbrSpecularGlossinessTextureUniforms: function() {
        if (this._extensions['KHR_materials_pbrSpecularGlossinessTextureUniforms']) return;

        this._extensions['KHR_materials_pbrSpecularGlossinessTextureUniforms'] = true;
        var stateSet = this._stateSetTextureUnit;
        var albedo = Uniform.createInt(
            ReaderWriterGLTF.DIFFUSE_TEXTURE_UNIT,
            ReaderWriterGLTF.ALBEDO_UNIFORM
        );
        var specluarGlossiness = Uniform.createInt(
            ReaderWriterGLTF.SPECULAR_GLOSSINESS_TEXTURE_UNIT,
            ReaderWriterGLTF.METALLIC_ROUGHNESS_UNIFORM
        );
        stateSet.addUniform(albedo);
        stateSet.addUniform(specluarGlossiness);
    },

    _KHR_materials_pbrSpecularGlossiness: function(material, stateSet) {
        this._KHR_materials_pbrSpecularGlossinessTextureUniforms();
        var texture;
        var color;
        if (material.diffuseTexture) {
            texture = this._texture(material.diffuseTexture);
            stateSet.setTextureAttributeAndModes(ReaderWriterGLTF.DIFFUSE_TEXTURE_UNIT, texture);
        } else if (material.diffuseFactor) {
            color = Uniform.createFloat4(material.diffuseFactor, 'uBaseColorFactor');
            stateSet.addUniform(color);
        }

        if (material.specularFactor) {
            color = Uniform.createFloat4(material.specularFactor, 'uSpecularFactor');
            stateSet.addUniform(color);
        }

        if (material.glossinessFactor !== undefined) {
            var factor = Uniform.createFloat(material.glossinessFactor, 'uGlossinessFactor');
            stateSet.addUniform(factor);
        }

        if (material.specularGlossinessTexture) {
            texture = this._texture(material.specularGlossinessTexture);
            stateSet.setTextureAttributeAndModes(
                ReaderWriterGLTF.SPECULAR_GLOSSINESS_TEXTURE_UNIT,
                texture
            );
        }
    },

    loadMaterials: function() {
        var materials = this._gltfJSON.materials;

        for (var i = 0; i < materials.length; i++) {
            var material = materials[i];
            var stateSet = new StateSet();
            var texture;
            material.osgjsStateSet = stateSet;

            if (material.pbrMetallicRoughness) {
                this._pbrMetallicRoughness(material, stateSet);
                continue;
            } else if (material.pbrMetallicRoughness) {
            }

            if (material.normalTexture) {
                texture = this._texture(material.normalTexture);
                stateSet.setTextureAttributeAndModes(ReaderWriterGLTF.NORMAL_TEXTURE_UNIT, texture);
            }
            if (material.occlusionTexture) {
                texture = this._texture(material.occlusionTexture);
                stateSet.setTextureAttributeAndModes(ReaderWriterGLTF.AO_TEXTURE_UNIT, texture);
            }

            if (material.emissiveTexture) {
                texture = this._texture(material.emissiveTexture);
                stateSet.setTextureAttributeAndModes(
                    ReaderWriterGLTF.EMISSIVE_TEXTURE_UNIT,
                    texture
                );
            } else if (material.emissiveFactor) {
                stateSet.addUniform(
                    Uniform.createFloat3(material.emissiveFactor, 'uEmissiveFactor')
                );
            }
        }

        // Handles basic material attributes
        var osgMaterial = new Material();
        var osgStateSet = geometryNode.getOrCreateStateSet();
        osgStateSet.setAttribute(osgMaterial);

        if (values.ambient) osgMaterial.setAmbient(values.ambient);
        if (values.emission) osgMaterial.setEmission(values.emission);
        if (values.shininess) osgMaterial.setShininess(values.shininess);
        if (values.specular) osgMaterial.setSpecular(values.specular);

        // Create a texture for the diffuse, if any
        if (values.diffuse) {
            if (typeof values.diffuse !== 'string') osgMaterial.setDiffuse(values.diffuse);
            else return this.createTextureAndSetAttrib(values.diffuse, osgStateSet, 0);
        }
    },

    _findRootBones: function(skinID, roots) {
        var skins = this._gltfJSON.skins;
        var skin = skins[skinID];
        if ( skin.skeleton !== undefined ) {
            roots.push(skin.skeleton);
            return;
        }

        var joints = skin.joints;
        for (var j = 1; j < joints.length; j++) {
            var joinID = joints[j];
            if ( )
            if (joints[j] )
        }

    },

    loadSkins: function() {
        var accessors = this._gltfJSON.accessors;
        var skins = this._gltfJSON.skins;
        var nodes = this._gltfJSON.nodes;
        for (var i = 0; i < skins.length; i++) {
            var skin = skins[i];
            nodes[skin.skeleton].osgjsSkeleton = new Skeleton();
            for (var j = 1; j < skin.joints.length; j++) {
                var nodeBoneIndex = skin.joints[j];
                var inverseBindMatrixIndex = skin.inverseBindMatrices;
                var bone = new Bone();
                nodes[nodeBoneIndex].osgjsBone = bone;
                var buffer = accessors[inverseBindMatrixIndex].data.getElements().buffer;
                bone.setInvBindMatrixInSkeletonSpace(new Float32Array(buffer, 16 * 4 * j, 16));
            }
        }
    },

    loadAnimations: function() {
        var animations = this._gltfJSON.animations;
        var nodes = this._gltfJSON.nodes;
        var accessors = this._gltfJSON.accessors;
        var osgjsAnimations = [];
        for (var i = 0; i < animations.length; i++) {
            var channels = animations[i].channels;
            var samplers = animations[i].samplers;
            var osgjsChannels = [];
            for (var j = 0; j < channels.length; j++) {
                var channel = channels[j];
                var sampler = samplers[channel.sampler];
                var times = accessors[sampler.input].data.getElements();
                var accessorValues = accessors[sampler.output];
                var values = accessorValues.data.getElements();
                // target.id is deprecated
                var target = channel.target;
                var createChannel =
                    ReaderWriterGLTF.TYPE_CHANNEL_PATH[target.path][accessorValues.type];

                var nodeIndex = target.node !== undefined ? target.node : target.id;
                var node = nodes[nodeIndex];
                var targetName = node.name ? node.name : node.uuid;
                var channelName = channel.path;
                osgjsChannels.push(createChannel(values, times, targetName, channelName));
            }

            var animationName = 'animation-' + i.toString();
            osgjsAnimations.push(animationFactory.createAnimation(osgjsChannels, animationName));
        }

        var animationManager = new BasicAnimationManager();
        animationManager.init(osgjsAnimations);
        this._animationManager = animationManager;
    },

    prepareBufferViews: function() {
        var promises = [];
        for (var i = 0; i < this._gltfJSON.bufferViews.length; i++) {
            var bufferView = this._gltfJSON.bufferViews[i];
            if (buffer.uri) {
                promises.push(
                    this.loadURI(buffer.uri).then(function(arrayBuffer) {
                        buffer.data = arrayBuffer;
                    })
                );
            }
        }
        return promises;
    },

    loadURI: P.method(function(uri) {
        // is base64 inline data
        if (uri.substr(0, 5) === 'data:') {
            return base64ToArrayBuffer(uri);
        }

        var ext = uri.substr(uri.lastIndexOf('.') + 1);
        var fileType = FileHelper.getTypeForExtension(ext);

        var url = this._localPath + uri;
        if (fileType === 'blob') {
            return this._inputReader.readImageURL(url, {
                imageLoadingUsePromise: true
            });
        } else if (fileType === 'arraybuffer') {
            return this._inputReader.readBinaryArrayURL(url, {
                fileType: fileType
            });
        }

        return undefined;
    }),

    /**
     * Loads a osg.BufferArray from a TypeArray obtained by using a glTF accessor.
     * No memory allocation is done, the result is a subarray obtained from a glTF binary file
     * @param  {Object} accessor
     * @param  {osg.BufferArray.ARRAY_BUFFER | osg.BufferArray.ELEMENT_ARRAY_BUFFER} type WebGL buffer type
     * @param  {TypedArray} BufferType specific TypedArray type used for extraction
     * @return {osg.BufferArray} OSG readable buffer contaning the extracted data
     */
    loadAccessorBuffer: function(accessor, type) {
        var json = this._glTFJSON;
        var bufferView = json.bufferViews[accessor.bufferView];
        var buffer = json.buffers[bufferView.buffer];
        var filePromise = this.loadFile(buffer.uri);
        var self = this;
        return filePromise.then(function(data) {
            return self.assignBuffers(data, accessor, type, bufferView);
        });
    },

    assignBuffers: P.method(function(data, accessor, type, bufferView) {
        if (!data) return null;

        var TypedArray = ReaderWriterGLTF.WEBGL_COMPONENT_TYPES[accessor.componentType];
        var typedArray = null;

        if (!this._bufferViewCache[accessor.bufferView])
            this._bufferViewCache[accessor.bufferView] = data.slice(
                bufferView.byteOffset,
                bufferView.byteOffset + bufferView.byteLength
            );

        var bufferViewArray = this._bufferViewCache[accessor.bufferView];
        typedArray = new TypedArray(
            bufferViewArray,
            accessor.byteOffset,
            accessor.count * ReaderWriterGLTF.TYPE_TABLE[accessor.type]
        );

        if (type)
            return new BufferArray(
                type,
                typedArray,
                ReaderWriterGLTF.TYPE_TABLE[accessor.type],
                true
            );
        return typedArray;
    }),

    findByKey: function(obj, key) {
        return obj && obj[key];
    },

    registerUpdateCallback: function(callbackName, node) {
        var json = this._glTFJSON;

        var animationCallback = null;
        if (json.nodes[callbackName].jointName) animationCallback = new UpdateBone();
        else animationCallback = new UpdateMatrixTransform();

        animationCallback.setName(callbackName);

        var translation = vec3.create();
        mat4.getTranslation(translation, node.getMatrix());

        var rotationQuat = quat.create();
        mat4.getRotation(rotationQuat, node.getMatrix());

        var scale = vec3.create();
        mat4.getScale(scale, node.getMatrix());

        animationCallback
            .getStackedTransforms()
            .push(new StackedTranslate('translation', translation));
        animationCallback
            .getStackedTransforms()
            .push(new StackedQuaternion('rotation', rotationQuat));
        animationCallback.getStackedTransforms().push(new StackedScale('scale', scale));

        node.addUpdateCallback(animationCallback);
    },

    createTextureAndSetAttrib: P.method(function(glTFTextureObject, stateSet, location, uniform) {
        if (!glTFTextureObject) return;
        var json = this._glTFJSON;
        var glTFTexture = json.textures[glTFTextureObject.index];
        if (!glTFTexture) return;

        var image = json.images[glTFTexture.source];

        if (!image) return;
        var texture = new Texture();
        // GLTF texture origin is correct
        texture.setFlipY(false);
        texture.setWrapS('REPEAT');
        texture.setWrapT('REPEAT');

        this.loadFile(image.uri).then(function(data) {
            if (!data) return;
            texture.setImage(data, ReaderWriterGLTF.TEXTURE_FORMAT[glTFTexture.format]);
            stateSet.setTextureAttributeAndModes(location, texture);
            if (uniform) {
                stateSet.addUniform(Uniform.createInt(location, uniform));
            }
            return;
        });
    }),

    /**
     * Creates a MatrixTransform node by using
     * glTF node's properties (matrix, translation, rotation, scale)
     * @param  {Object} glTFNode glTF node
     * @return {OSG.MatrixTransform} MatrixTransform node containing the glTF node transform
     */
    loadTransform: function(glTFNode) {
        var mat = mat4.create();
        // The transform is given under a matrix form
        if (glTFNode.matrix) {
            mat4.copy(mat, glTFNode.matrix);
            return mat;
        }
        // The transform is given under the form
        // translation, rotation, scale
        var scale = glTFNode.scale || vec3.ONE;
        var rot = glTFNode.rotation || quat.IDENTITY;
        var trans = glTFNode.translation || vec3.ZERO;

        mat4.fromRotationTranslationScale(mat, rot, trans, scale);
        return mat;
    },

    preprocessChannel: function(glTFChannel, glTFAnim) {
        var json = this._glTFJSON;
        var promisesArray = [];

        var glTFSampler = glTFAnim.samplers[glTFChannel.sampler];

        var timeAccessor = json.accessors[glTFSampler.input];
        var valueAccessor = json.accessors[glTFSampler.output];

        var timePromise = this.loadAccessorBuffer(timeAccessor, null);
        var valuePromise = this.loadAccessorBuffer(valueAccessor, null);

        promisesArray.push(timePromise, valuePromise);

        var self = this;

        return P.all(promisesArray).then(function(timeAndValue) {
            var timeKeys = timeAndValue[0];
            var valueKeys = timeAndValue[1];

            var osgChannel = null;

            if (ReaderWriterGLTF.TYPE_TABLE[valueAccessor.type] === 4) {
                osgChannel = createQuatChannel(
                    valueKeys,
                    timeKeys,
                    glTFChannel.target.node,
                    glTFChannel.target.path,
                    null
                );
            } else if (ReaderWriterGLTF.TYPE_TABLE[valueAccessor.type] === 3) {
                osgChannel = createVec3Channel(
                    valueKeys,
                    timeKeys,
                    glTFChannel.target.node,
                    glTFChannel.target.path,
                    null
                );
            }

            self._animatedNodes[glTFChannel.target.node] = true;

            return osgChannel;
        });
    },

    createAnimationFromChannels: function(channelsPromiseArray, animName) {
        return P.all(channelsPromiseArray).then(function(channels) {
            return animation.createAnimation(channels, animName);
        });
    },

    /**
     * Loads all the solid animations registering
     * them in a BasicAnimationManager instance
     * @return {BasicAnimationManager} the animation manager containing the animations
     */
    preprocessAnimations: P.method(function() {
        var json = this._glTFJSON;

        if (!json.animations) return;

        var animPromiseArray = [];

        var animationsObjectKeys = window.Object.keys(json.animations);
        for (var i = 0; i < animationsObjectKeys.length; ++i) {
            var glTFAnim = json.animations[animationsObjectKeys[i]];

            var channelsPromiseArray = [];
            // Creates each OSGJS channel
            for (var j = 0; j < glTFAnim.channels.length; ++j) {
                var glTFChannel = glTFAnim.channels[j];

                var osgChannel = this.preprocessChannel(glTFChannel, glTFAnim);
                channelsPromiseArray.push(osgChannel);
            }

            var animPromise = this.createAnimationFromChannels(
                channelsPromiseArray,
                animationsObjectKeys[i]
            );
            animPromiseArray.push(animPromise);
        }

        var self = this;
        return P.all(animPromiseArray).then(function(animations) {
            var animationManager = new BasicAnimationManager();
            animationManager.init(animations);

            self._basicAnimationManager = animationManager;
            animationManager.playAnimation(animations[0].name);
        });
    }),

    loadBone: function(boneId, skin) {
        var json = this._glTFJSON;
        var node = json.nodes[boneId];

        var self = this;

        var inverseBindMatricesAccessor = json.accessors[skin.inverseBindMatrices];
        var bonePromise = this.loadAccessorBuffer(inverseBindMatricesAccessor, null);
        return bonePromise.then(function(data) {
            // Creates the current bone
            // initializing it with initial pose
            for (var i = 0; i < skin.joints.length; ++i) {
                if (skin.joints[i] === node.jointName) break;
            }

            var boneNode = new Bone(node.jointName);
            var invMat = data.subarray(i * 16, i * 16 + 16);
            boneNode.setInvBindMatrixInSkeletonSpace(invMat);

            self._bones[boneId] = boneNode;

            return boneNode;
        });
    },

    buildInfluenceMap: function(skin, skinId) {
        var skeletonToInfluenceMap = this._skeletonToInfluenceMap[skinId];
        if (!skeletonToInfluenceMap) {
            skeletonToInfluenceMap = {};
            this._skeletonToInfluenceMap[skinId] = skeletonToInfluenceMap;
        }

        for (var j = 0; j < skin.joints.length; j++) {
            var jointName = skin.joints[j];
            skeletonToInfluenceMap[jointName] = j;
        }
    },

    mapBonesToSkin: function() {
        var json = this._glTFJSON;

        var boneToSkin = {};

        // Maps each bone ID to its skin
        var skinsKeys = window.Object.keys(json.skins);
        for (var i = 0; i < skinsKeys.length; ++i) {
            var skin = json.skins[skinsKeys[i]];

            for (var j = 0; j < skin.joints.length; ++j) {
                var jName = skin.joints[j];

                var nodesKeys = window.Object.keys(json.nodes);
                for (var k = 0; k < nodesKeys.length; ++k) {
                    var node = json.nodes[nodesKeys[k]];

                    if (node.jointName && node.jointName === jName) boneToSkin[nodesKeys[k]] = skin;
                }
            }
        }

        return boneToSkin;
    },

    preprocessBones: function(bonesToSkin) {
        var json = this._glTFJSON;
        var nodesKeys = window.Object.keys(json.nodes);
        var promises = [];
        for (var i = 0; i < nodesKeys.length; ++i) {
            var boneId = nodesKeys[i];
            var boneNode = json.nodes[boneId];
            if (!boneNode.jointName || bonesToSkin[boneId] === undefined) continue;
            var bonePromise = this.loadBone(boneId, bonesToSkin[boneId]);
            promises.push(bonePromise);
        }
        return P.all(promises);
    },

    preprocessSkeletons: P.method(function() {
        var json = this._glTFJSON;
        if (!json.skins) return;
        var bonesToSkin = this.mapBonesToSkin();

        // Saves each skeleton in the skeleton maprep
        var nodesKeys = window.Object.keys(json.nodes);
        for (var j = 0; j < nodesKeys.length; ++j) {
            var nodeId = nodesKeys[j];
            var node = json.nodes[nodeId];
            var skin = json.skins[node.skin];

            if (!node.skeletons) continue;

            for (var i = 0; i < node.skeletons.length; ++i) {
                var rootBoneId = node.skeletons[i];
                if (rootBoneId && !this._skeletons[rootBoneId]) {
                    this._skeletons[rootBoneId] = new Skeleton();
                    this._skeletons[rootBoneId].setName(rootBoneId);
                    this._bindShapeMatrices[rootBoneId] = skin.bindShapeMatrix;
                    // Adds missing bone to the boneMap
                    bonesToSkin[rootBoneId] = skin;

                    for (var k = 0; k < skin.jointNames.length; ++k) {
                        this._boneToSkeleton[skin.jointNames[k]] = rootBoneId;
                    }
                }
                this.buildInfluenceMap(skin, node.skin);
            }
        }
    }),

    loadPBRMaterial: P.method(function(materialId, glTFmaterial, geometryNode, extension) {
        var pbrMetallicRoughness = glTFmaterial.pbrMetallicRoughness;
        var osgStateSet = geometryNode.getOrCreateStateSet();

        var promises = [];
        var model = '';

        if (pbrMetallicRoughness) {
            if (pbrMetallicRoughness.baseColorTexture)
                promises.push(
                    this.createTextureAndSetAttrib(
                        pbrMetallicRoughness.baseColorTexture,
                        osgStateSet,
                        ReaderWriterGLTF.ALBEDO_TEXTURE_UNIT,
                        ReaderWriterGLTF.ALBEDO_UNIFORM
                    )
                );
            if (pbrMetallicRoughness.baseColorFactor) {
                //PBR default uniforms
                osgStateSet.addUniform(
                    Uniform.createFloat4(pbrMetallicRoughness.baseColorFactor, 'uBaseColorFactor')
                );
            }

            if (pbrMetallicRoughness.metallicFactor !== undefined) {
                osgStateSet.addUniform(
                    Uniform.createFloat1(pbrMetallicRoughness.metallicFactor, 'uMetallicFactor')
                );
            }
            if (pbrMetallicRoughness.roughnessFactor !== undefined) {
                osgStateSet.addUniform(
                    Uniform.createFloat1(pbrMetallicRoughness.roughnessFactor, 'uRoughnessFactor')
                );
            }

            if (pbrMetallicRoughness.metallicRoughnessTexture)
                promises.push(
                    this.createTextureAndSetAttrib(
                        pbrMetallicRoughness.metallicRoughnessTexture,
                        osgStateSet,
                        ReaderWriterGLTF.METALLIC_ROUGHNESS_TEXTURE_UNIT,
                        ReaderWriterGLTF.METALLIC_ROUGHNESS_UNIFORM
                    )
                );
            model = ReaderWriterGLTF.PBR_METAL_MODE;
        }
        // SPECULAR/GLOSSINESS
        if (extension) {
            if (extension.diffuseFactor) {
                //PBR default uniforms
                osgStateSet.addUniform(
                    Uniform.createFloat4(extension.diffuseFactor, 'uBaseColorFactor')
                );
            }
            if (extension.glossinessFactor !== undefined) {
                osgStateSet.addUniform(
                    Uniform.createFloat1(extension.glossinessFactor, 'uGlossinessFactor')
                );
            }
            if (extension.specularFactor !== undefined) {
                osgStateSet.addUniform(
                    Uniform.createFloat3(extension.specularFactor, 'uSpecularFactor')
                );
            }
            if (extension.diffuseTexture) {
                promises.push(
                    this.createTextureAndSetAttrib(
                        extension.diffuseTexture,
                        osgStateSet,
                        ReaderWriterGLTF.DIFFUSE_TEXTURE_UNIT,
                        ReaderWriterGLTF.ALBEDO_UNIFORM
                    )
                );
            }
            if (extension.specularGlossinessTexture) {
                promises.push(
                    this.createTextureAndSetAttrib(
                        extension.specularGlossinessTexture,
                        osgStateSet,
                        ReaderWriterGLTF.SPECULAR_GLOSSINESS_TEXTURE_UNIT,
                        ReaderWriterGLTF.METALLIC_ROUGHNESS_UNIFORM
                    )
                );
            }
            model = ReaderWriterGLTF.PBR_SPEC_MODE;
        }
        if (glTFmaterial.normalTexture) {
            promises.push(
                this.createTextureAndSetAttrib(
                    glTFmaterial.normalTexture,
                    osgStateSet,
                    ReaderWriterGLTF.NORMAL_TEXTURE_UNIT,
                    ReaderWriterGLTF.NORMAL_UNIFORM
                )
            );
        }
        if (glTFmaterial.occlusionTexture) {
            promises.push(
                this.createTextureAndSetAttrib(
                    glTFmaterial.occlusionTexture,
                    osgStateSet,
                    ReaderWriterGLTF.AO_TEXTURE_UNIT,
                    ReaderWriterGLTF.AO_UNIFORM
                )
            );
        }
        if (glTFmaterial.emissiveFactor !== undefined) {
            osgStateSet.addUniform(
                Uniform.createFloat3(glTFmaterial.emissiveFactor, 'uEmissiveFactor')
            );
        }
        if (glTFmaterial.emissiveTexture !== undefined) {
            promises.push(
                this.createTextureAndSetAttrib(
                    glTFmaterial.emissiveTexture,
                    osgStateSet,
                    ReaderWriterGLTF.EMISSIVE_TEXTURE_UNIT,
                    ReaderWriterGLTF.EMISSIVE_UNIFORM
                )
            );
        }
        // TODO:Need to check for specular glossiness extension
        geometryNode.setUserData({
            pbrWorklow: model
        });

        geometryNode.stateset = osgStateSet;
        osgStateSet.setRenderingHint('TRANSPARENT_BIN');
        osgStateSet.setRenderBinDetails(1000, 'RenderBin');
        osgStateSet.setAttributeAndModes(new BlendFunc('SRC_ALPHA', 'ONE_MINUS_SRC_ALPHA'));
        this._stateSetMap[materialId] = osgStateSet;

        return P.all(promises);
    }),

    loadMaterial: P.method(function(materialId, geometryNode) {
        var json = this._glTFJSON;
        var glTFmaterial = json.materials[materialId];

        if (this._stateSetMap[materialId]) {
            geometryNode.stateset = this._stateSetMap[materialId];
            return;
        }

        var extension = this.findByKey(glTFmaterial.extensions, ReaderWriterGLTF.PBR_SPEC_EXT);
        if (glTFmaterial.pbrMetallicRoughness || extension)
            return this.loadPBRMaterial(materialId, glTFmaterial, geometryNode, extension);

        var values = glTFmaterial.values;
        if (!values) return;

        // Handles basic material attributes
        var osgMaterial = new Material();
        var osgStateSet = geometryNode.getOrCreateStateSet();
        osgStateSet.setAttribute(osgMaterial);

        if (values.ambient) osgMaterial.setAmbient(values.ambient);
        if (values.emission) osgMaterial.setEmission(values.emission);
        if (values.shininess) osgMaterial.setShininess(values.shininess);
        if (values.specular) osgMaterial.setSpecular(values.specular);

        // Create a texture for the diffuse, if any
        if (values.diffuse) {
            if (typeof values.diffuse !== 'string') osgMaterial.setDiffuse(values.diffuse);
            else return this.createTextureAndSetAttrib(values.diffuse, osgStateSet, 0);
        }

        geometryNode.stateset = osgStateSet;
        this._stateSetMap[materialId] = osgStateSet;

        return;
    }),

    createGeometry: function(primitive, skeletonJointId, skinId) {
        var json = this._glTFJSON;
        var promisesArray = [];

        // Builds the geometry from the extracted vertices & normals
        var geom = new Geometry();
        var rigOrGeom = geom;

        var cbSetBuffer = function(name, buffer) {
            if (!buffer) return;

            this.getVertexAttributeList()[name] = buffer;
        };

        if (skinId) {
            rigOrGeom = new RigGeometry();
            rigOrGeom._boneNameID = this._skeletonToInfluenceMap[skinId];
        }

        var attributeWeight = function(data) {
            if (!data) return;

            rigOrGeom.getAttributes().Weights = data;

            var elts = rigOrGeom.getAttributes().Weights.getElements();
            for (var i = 0, l = elts.length / 4; i < l; ++i) {
                var sum = elts[i * 4] + elts[i * 4 + 1] + elts[i * 4 + 2] + elts[i * 4 + 3];
                var correc = 1.0 / sum;
                elts[i * 4] *= correc;
                elts[i * 4 + 1] *= correc;
                elts[i * 4 + 2] *= correc;
                elts[i * 4 + 3] *= correc;
            }
        };

        // Registers each glTF primitive attributes
        // into a respective geometry attribute
        var attributesKeys = window.Object.keys(primitive.attributes);
        for (var i = 0; i < attributesKeys.length; ++i) {
            var accessor = json.accessors[primitive.attributes[attributesKeys[i]]];
            var promise = this.loadAccessorBuffer(accessor, BufferArray.ARRAY_BUFFER);

            if (attributesKeys[i].indexOf('POSITION') !== -1) {
                promise.then(cbSetBuffer.bind(geom, 'Vertex'));
            } else if (attributesKeys[i].indexOf('NORMAL') !== -1) {
                promise.then(cbSetBuffer.bind(geom, 'Normal'));
            } else if (attributesKeys[i].indexOf('TANGENT') !== -1) {
                promise.then(cbSetBuffer.bind(geom, 'Tangent'));
            } else if (attributesKeys[i].indexOf('JOINT') !== -1) {
                promise.then(cbSetBuffer.bind(rigOrGeom, 'Bones'));
            } else if (attributesKeys[i].indexOf('WEIGHT') !== -1) {
                promise.then(attributeWeight);
            } else if (attributesKeys[i].indexOf('COLOR') !== -1) {
                promise.then(cbSetBuffer.bind(geom, 'Color'));
            } else if (attributesKeys[i].indexOf('TEXCOORD') !== -1) {
                var texCoordId = attributesKeys[i].substr(9);
                promise.then(cbSetBuffer.bind(geom, 'TexCoord' + texCoordId));
            }

            promisesArray.push(promise);
        }

        var indicesAccessor = json.accessors[primitive.indices];
        var indicesPromise = this.loadAccessorBuffer(
            indicesAccessor,
            BufferArray.ELEMENT_ARRAY_BUFFER
        );
        indicesPromise.then(function(data) {
            if (!data) return;

            var osgPrimitive = new DrawElements(primitiveSet.TRIANGLES, data);
            geom.getPrimitives().push(osgPrimitive);
        });

        promisesArray.push(indicesPromise);

        if (primitive.material !== undefined)
            promisesArray.push(this.loadMaterial(primitive.material, geom));

        return P.all(promisesArray).then(
            function() {
                if (skeletonJointId) {
                    rigOrGeom.setSourceGeometry(geom);
                    rigOrGeom.mergeChildrenData();
                    this.applyBindShapeMatrix(rigOrGeom, skeletonJointId);
                    rigOrGeom.computeBoundingBox = geom.computeBoundingBox;
                }

                return rigOrGeom;
            }.bind(this)
        );
    },

    applyBindShapeMatrix: function(rigGeom, skeletonJointId) {
        var bindShape = this._bindShapeMatrices[skeletonJointId];
        var elts = rigGeom.getVertexAttributeList()['Vertex'].getElements();
        var v = vec3.create();
        for (var i = 0; i < elts.length; i += 3) {
            v.set([elts[i], elts[i + 1], elts[i + 2]]);
            vec3.transformMat4(v, v, bindShape);
            elts[i] = v[0];
            elts[i + 1] = v[1];
            elts[i + 2] = v[2];
        }
    },

    loadGLTFPrimitives: function(meshId, resultMeshNode, skeletonJointId, skinId) {
        var json = this._glTFJSON;
        var mesh = json.meshes[meshId];

        var primitives = mesh.primitives;

        var promisesArray = [];
        var i;
        for (i = 0; i < primitives.length; ++i) {
            var primitive = primitives[i];
            var promiseGeom = this.createGeometry(primitive, skeletonJointId, skinId);

            promisesArray.push(promiseGeom);
        }

        return P.all(promisesArray).then(function(geoms) {
            for (i = 0; i < geoms.length; ++i) resultMeshNode.addChild(geoms[i]);

            return geoms;
        });
    },

    loadGLTFNode: P.method(function(nodeId, root) {
        if (this._visitedNodes[nodeId]) return undefined;

        var json = this._glTFJSON;
        var glTFNode = json.nodes[nodeId];
        var currentNode;

        if (glTFNode.jointName) {
            currentNode = this._bones[nodeId];
        } else {
            currentNode = new MatrixTransform();
        }

        if (this._skeletons[nodeId]) {
            var skeleton = this._skeletons[nodeId];
            if (currentNode.className && currentNode.className() !== 'Bone') {
                currentNode.addChild(skeleton);
                root.addChild(currentNode);
                currentNode = skeleton;
            } else {
                skeleton.addChild(currentNode);
                root.addChild(skeleton);
            }
        }

        // Recurses on children before
        // processing the current node
        var children = glTFNode.children;
        var i;
        var promises = [];
        if (children) {
            for (i = 0; i < children.length; ++i) {
                var nodePromise = this.loadGLTFNode(children[i], currentNode);
                promises.push(nodePromise);
            }
        }
        // Loads meshes contained in the node
        // Adds RigGeometry to corresponding skeleton if any
        if (glTFNode.mesh !== undefined) {
            var meshId = glTFNode.mesh;
            if (!glTFNode.skeletons) {
                var geomPromise = this.loadGLTFPrimitives(meshId, currentNode);
                promises.push(geomPromise);
            } else {
                var geomP = this.loadGLTFPrimitives(
                    meshId,
                    currentNode,
                    glTFNode.skeletons[0],
                    glTFNode.skin
                );
                root.addChild(currentNode);
                promises.push(geomP);
                this._rigToSkeleton[nodeId] = [];
                for (var j = 0; j < glTFNode.skeletons.length; ++j) {
                    var rootJointId = glTFNode.skeletons[j];
                    var skeletonNode = this._skeletons[rootJointId];

                    this._rigToSkeleton[nodeId].push(skeletonNode);
                    this._rigToRigNode[nodeId] = currentNode;
                }
            }
        }
        // Loads solid animations
        // by adding an update callback
        if (this._animatedNodes[nodeId] || currentNode.className() === 'Bone')
            this.registerUpdateCallback(nodeId, currentNode, glTFNode);

        if (!this._skeletons[nodeId]) root.addChild(currentNode);

        return P.all(promises);
    }),

    readNodeURL: function(url, options) {
        var self = this;

        this.init();
        if (options && options.filesMap !== undefined && options.filesMap.size > 0) {
            // it comes from the ZIP plugin or from drag'n drop
            // So we already have all the files.
            this._filesMap = options.filesMap;
            var glTFFile = this._filesMap.get(url);
            return this.readJSON(glTFFile, url);
        }

        var index = url.lastIndexOf('/');
        this._localPath = index === -1 ? '' : url.substr(0, index + 1);
        // Else it is a usual XHR request
        var filePromise = requestFile(url);
        return filePromise.then(function(file) {
            return self.readJSON(file);
        });
    },

    readJSON: P.method(function(glTFFile, url) {
        var json = JSON.parse(glTFFile);
        if (!json) return undefined;

        this._gltfJSON = json;

        return this.loadBuffers().then(
            function() {
                this.loadBufferViews();
                this.loadAccessors();
                this.loadAnimations();
                this.loadSkins();
                this.loadMeshes();
                this.loadNodes();
                this.loadScenes();

                var root = new Node();
                root.addChild(this._osgjsScene[0]);
                root.setName(url);
                return root;
            }.bind(this)
        );

        // Preprocesses animations
        var animPromise = this.preprocessAnimations();

        // Preprocesses skin animations if any
        var skeletonPromise = this.preprocessSkeletons();

        var self = this;
        return P.all([skeletonPromise, animPromise]).then(function() {
            var promises = [];
            // Loops through each scene
            // loading geometry nodes, transform nodes, etc...s
            var sceneKeys = window.Object.keys(json.scenes);
            for (var i = 0; i < sceneKeys.length; ++i) {
                var scene = json.scenes[sceneKeys[i]];

                if (!scene) continue;
                for (var j = 0; j < scene.nodes.length; ++j) {
                    var p = self.loadGLTFNode(scene.nodes[j], root);
                    promises.push(p);
                }
            }

            // Register the animation manager
            // if the glTF file contains animations
            if (self._basicAnimationManager) root.addUpdateCallback(self._basicAnimationManager);

            return P.all(promises).then(function() {
                return root;
            });
        });
    })
};

Registry.instance().addReaderWriter('gltf', new ReaderWriterGLTF());

export default ReaderWriterGLTF;
