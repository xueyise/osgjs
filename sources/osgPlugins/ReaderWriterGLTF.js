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

    // add parents to all nodes because it's easier later
    // espacially on skinning
    _addParentToNodes: function() {
        var nodes = this._gltfJSON.nodes;
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            var children = node.children;
            for (var j = 0; j < children.length; j++) {
                var child = children[j];
                child.parent = i;
            }
        }
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
        var nodes = this._gltfJSON.nodes;
        var skin = skins[skinID];
        var bones = skin.joints;
        var roots = [];
        this._findRootBones(skinID, roots);
        var skeleton = new Skeleton();
        for (var i = 0; i < roots.length; i++) {
            skeleton.addChild(nodes[roots[i]]);
        }
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

    /*
    Different glTF skins can reference the same glTF node, but with different invBindMatrices.
    We want no duplication, so we need to do some merge/transformations.

    1- Generate a skeleton for each glTF skin, and add it to the graph. A 'distance from root'
    is also computed to determine which skeleton is higher in the scene graph.

    2- Look for intersection between skins (i.e two skins using at least one same node as joint) then:
        a. shared joints: use the bone from the skin whose corresponding skeleton is higher in the scene graph
        b. include joints from the skin having the lower skeleton to the skeleton of the other skin

        Skin 1    Skin 2                Skeleton(skin 1, higher in the scene graph than skin2's skeleton)
          3         5                       3
          4         6          =>           4
          5         7                       5
                                            6*
                                            7*
    3- Compute merge matrices: used to offset invbinds when adding a glTF bone to a specific osg skeleton.
    A merge matrix transforms a point from mesh space to skeleton space, and is used
    to convert from glTF invbind (Bone->Mesh) to an OSG invBind (Bone->Skeleton)
    */
    loadSkins: function() {
        var accessors = this._gltfJSON.accessors;
        var skins = this._gltfJSON.skins;
        var nodes = this._gltfJSON.nodes;
        var skinResults = [];
        // get all nodes path with parentNode to insert the skeleton
        for (var i = 0; i < skins.length; i++) {
            var skinID = skins[i];
            var skeleton = this._processSkin(skinID);

            // result contains {
            //   nodePath: [nodeID, nodeID, ...]
            //   nodeID: parentID
            // }
            var skinResult = this._findNodeToInsertSkeleton(i);
            if (!skinResult) console.error('loadSkins: the impossible happened');
            skinResults.push(skinResults);
        }

        // TODO check if there are joints interesection between skins and handle this case
        // but later

        //this._skeleton[]
        // nodes[skin.skeleton].osgjsSkeleton = new Skeleton();
        //     for (var j = 1; j < skin.joints.length; j++) {
        //         var nodeBoneIndex = skin.joints[j];
        //         var inverseBindMatrixIndex = skin.inverseBindMatrices;
        //         var bone = new Bone();
        //         nodes[nodeBoneIndex].osgjsBone = bone;
        //         var buffer = accessors[inverseBindMatrixIndex].data.getElements().buffer;
        //         bone.setInvBindMatrixInSkeletonSpace(new Float32Array(buffer, 16 * 4 * j, 16));
        //     }
        // }
    },

    _createBone: function(nodeID) {
        var nodes = this._gltfJSON.nodes;
        var node = nodes[nodeID];
        var bone = new Bone();
        if (node.name) bone.setName(node.name);
        var matrix = this._computeNodeMatrix(nodeID);
        bone.setMatrix(matrix);
        return bone;
    },

    _processSkin: function(skinID) {
        var skins = this._gltfJSON.skins;
        var nodes = this._gltfJSON.nodes;
        var skin = skins[skinID];
        var skeleton = new Skeleton();
        skeleton.setName('skin ID ' + skinID );
        var nodeID;
        var boneMap = {};
        var node;
        var bone;
        // first create all bones
        for (var i = 0; i < skin.children; i++) {
            nodeID = skin.children[i];
            bone = this._createBone(nodeID);
            boneMap[nodeID] = bone;
        }

        for ( var boneID in boneMap ) {
            node = nodes[boneID];
            var parentID = node.parent;
            bone = boneMap[boneID];
            if (parentID === undefined || skin.children.indexOf(parentID) === -1) {
                skeleton.addChild(bone);
            } else {
                var boneParent = boneMap[parentID];
                boneParent.addChild(bone);
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
                this._addParentsToNodes();
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
    })
};

Registry.instance().addReaderWriter('gltf', new ReaderWriterGLTF());

export default ReaderWriterGLTF;
