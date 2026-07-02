import React, { useState, Suspense, useRef, useEffect, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, TransformControls, GizmoHelper, GizmoViewcube } from '@react-three/drei';
import { STLLoader } from 'three-stdlib';
import { STLExporter } from 'three-stdlib';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';

// --- HELPER: Geometry Stats ---
function getGeometryStats(geometry) {
  if (geometry.userData.stats) return geometry.userData.stats;
  
  let vol = 0;
  const pos = geometry.attributes.position;
  if (pos) {
    const p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), p3 = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      p1.fromBufferAttribute(pos, i);
      p2.fromBufferAttribute(pos, i + 1);
      p3.fromBufferAttribute(pos, i + 2);
      vol += p1.dot(p2.cross(p3)) / 6.0;
    }
  }
  
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  if (geometry.boundingBox) geometry.boundingBox.getSize(size);
  
  const stats = { volume: Math.abs(vol), dims: { x: size.x, y: size.y, z: size.z } };
  geometry.userData.stats = stats;
  return stats;
}

// --- COMPONENT: Standard Model (UPDATED) ---
function Model({ index, url, isSelected, onClick, color, position, rotation, registerRef }) {
  const geom = useLoader(STLLoader, url);
  const meshRef = useRef();
  
  useEffect(() => { 
    if (meshRef.current) registerRef(index, meshRef.current); 
    return () => registerRef(index, null); 
  }, [index, registerRef]);

  return (
    <mesh 
      ref={meshRef} 
      geometry={geom} 
      position={position} 
      rotation={rotation} 
      onClick={onClick}
      // FIX: Tag this mesh so the exporter knows it is a real bone model
      userData={{ isExportable: true }} 
    >
      <meshStandardMaterial 
        color={isSelected ? "#ffaa00" : (color || "#e3e3e3")} 
        roughness={0.5} 
        metalness={0.2} 
      />
    </mesh>
  );
}

// --- COMPONENT: Exporter (STRICT MODE) ---
function SceneExporter({ triggerDownload, setTriggerDownload }) {
  const { scene } = useThree();

  useEffect(() => {
    if (triggerDownload) {
      const exporter = new STLExporter();
      const exportGroup = new THREE.Group();

      scene.traverse((child) => {
        // FIX: STRICTLY only export meshes we tagged as 'isExportable'
        // This ignores Gizmos, Grids, and Helpers automatically.
        if (child.isMesh && child.userData.isExportable === true) {

          // 1. Clone geometry
          const geometry = child.geometry.clone();

          // 2. Force update world matrix to get exact screen position
          child.updateMatrixWorld(true);

          // 3. Bake position/rotation into the geometry vertices
          geometry.applyMatrix4(child.matrixWorld);

          // 4. Create export mesh
          const exportMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
          
          // Reset transforms (since vertices are already moved)
          exportMesh.position.set(0, 0, 0);
          exportMesh.rotation.set(0, 0, 0);
          exportMesh.scale.set(1, 1, 1);

          exportGroup.add(exportMesh);
        }
      });

      // Export
      const result = exporter.parse(exportGroup, { binary: true });
      const blob = new Blob([result], { type: 'application/octet-stream' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = 'Shalya_Saarthi_Plan.stl';
      link.click();
      URL.revokeObjectURL(url);
      setTriggerDownload(false);
    }
  }, [triggerDownload, scene, setTriggerDownload]);

  return null;
}

// --- MAIN APPLICATION ---
export default function App() {
  const [meshes, setMeshes] = useState([]);
  const [implantList, setImplantList] = useState([]); 
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [controlMode, setControlMode] = useState("translate");
  const [downloadTrigger, setDownloadTrigger] = useState(false);
  const [unit, setUnit] = useState("mm");

  const [snapTrans, setSnapTrans] = useState(1.0); 
  const [snapRot, setSnapRot] = useState(5.0);    

  const meshRefs = useRef({}); 
  const registerRef = useCallback((id, ref) => { 
    if (ref) meshRefs.current[id] = ref; 
    else delete meshRefs.current[id]; 
  }, []);
  
  const [liveStats, setLiveStats] = useState({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });
  const [stats, setStats] = useState({ volume: 0, dims: {x:0,y:0,z:0} });
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // --- INITIALIZATION ---
  useEffect(() => {
    const fetchImplants = async () => {
      try {
        const response = await fetch('/api/implants');
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            setImplantList(data);
            return;
          }
        }
      } catch (err) {
        console.warn("Failed to fetch implants from backend API, falling back to static list:", err);
      }
      // Fallback if API is unavailable or empty
      setImplantList([
        "Big flat_000.stl",
        "Big rod_000.stl",
        "Big_000.stl",
        "Medium_000.stl",
        "Small rod_000.stl",
        "small flat_000.stl",
        "small_000.stl"
      ]);
    };
    fetchImplants();
  }, []);

  // --- HISTORY LOGIC ---
  const saveToHistory = useCallback((newMeshes) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newMeshes);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setMeshes(history[prevIndex]);
      setHistoryIndex(prevIndex);
      setSelectedIds(new Set()); 
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setMeshes(history[nextIndex]);
      setHistoryIndex(nextIndex);
    }
  }, [history, historyIndex]);

  // --- SELECTION LOGIC ---
  const handleSelect = (index, isMulti) => {
    const newSet = new Set(isMulti ? selectedIds : []);
    if (newSet.has(index)) newSet.delete(index); else newSet.add(index);
    setSelectedIds(newSet);
    
    if (newSet.size > 0 && meshRefs.current[index]) {
      const geom = meshRefs.current[index].geometry;
      setStats(getGeometryStats(geom));
      const p = meshRefs.current[index].position;
      const r = meshRefs.current[index].rotation;
      setLiveStats({ x: p.x, y: p.y, z: p.z, rx: r.x, ry: r.y, rz: r.z });
    }
  };

  const selectAll = useCallback(() => {
    if (meshes.length === 0) return;
    setSelectedIds(new Set(meshes.map((_, i) => i)));
  }, [meshes]);

  // --- ALIGNMENT TOOLS ---
  const alignSelectionToOrigin = () => {
    if (selectedIds.size === 0) return;
    const box = new THREE.Box3();
    selectedIds.forEach(id => { 
      if (meshRefs.current[id]) box.union(new THREE.Box3().setFromObject(meshRefs.current[id])); 
    });
    if (box.isEmpty()) return;
    const center = new THREE.Vector3(); box.getCenter(center);
    const offset = center.negate();
    const newMeshes = [...meshes];
    selectedIds.forEach(id => {
      const currentPos = new THREE.Vector3().fromArray(newMeshes[id].position);
      const newPos = currentPos.add(offset);
      newMeshes[id] = { ...newMeshes[id], position: newPos.toArray() };
    });
    setMeshes(newMeshes); saveToHistory(newMeshes);
  };

  const alignSelectionToFloor = () => {
    if (selectedIds.size === 0) return;
    const box = new THREE.Box3();
    selectedIds.forEach(id => { 
      if (meshRefs.current[id]) box.union(new THREE.Box3().setFromObject(meshRefs.current[id])); 
    });
    if (box.isEmpty()) return;
    const offset = new THREE.Vector3(0, -box.min.y, 0);
    const newMeshes = [...meshes];
    selectedIds.forEach(id => {
      const currentPos = new THREE.Vector3().fromArray(newMeshes[id].position);
      const newPos = currentPos.add(offset);
      newMeshes[id] = { ...newMeshes[id], position: newPos.toArray() };
    });
    setMeshes(newMeshes); saveToHistory(newMeshes);
  };

  // --- GROUP TRANSFORM LOGIC ---
  const activeId = [...selectedIds].pop(); 
  const groupStart = useRef({}); 

  const onTransformStart = () => {
    if (activeId === undefined || !meshRefs.current[activeId]) return;
    const leader = meshRefs.current[activeId];
    groupStart.current = { 
      leaderId: activeId, 
      leaderStartPos: leader.position.clone(), 
      leaderStartQuat: leader.quaternion.clone(), 
      others: [] 
    };
    selectedIds.forEach(id => {
      if (id !== activeId && meshRefs.current[id]) {
        const other = meshRefs.current[id];
        groupStart.current.others.push({ 
          id: id, 
          startPos: other.position.clone(), 
          startQuat: other.quaternion.clone(), 
          offset: new THREE.Vector3().subVectors(other.position, leader.position) 
        });
      }
    });
  };

  const onTransformChange = () => {
    if (!groupStart.current.leaderId) return;
    const leader = meshRefs.current[groupStart.current.leaderId];
    setLiveStats({ 
      x: leader.position.x, y: leader.position.y, z: leader.position.z, 
      rx: leader.rotation.x, ry: leader.rotation.y, rz: leader.rotation.z 
    });
    const qDiff = leader.quaternion.clone().multiply(groupStart.current.leaderStartQuat.clone().invert());
    groupStart.current.others.forEach(data => {
      const neighbor = meshRefs.current[data.id];
      if (neighbor) {
        neighbor.quaternion.copy(qDiff).multiply(data.startQuat);
        const rotatedOffset = data.offset.clone().applyQuaternion(qDiff);
        neighbor.position.copy(leader.position).add(rotatedOffset);
      }
    });
  };

  const onTransformEnd = () => {
    const newMeshes = [...meshes];
    selectedIds.forEach(id => {
      if (meshRefs.current[id]) {
        newMeshes[id] = { 
          ...newMeshes[id], 
          position: meshRefs.current[id].position.toArray(), 
          rotation: meshRefs.current[id].rotation.toArray().slice(0, 3) 
        };
      }
    });
    setMeshes(newMeshes); saveToHistory(newMeshes); groupStart.current = {}; 
  };

  const applyColor = (color) => {
    const newMeshes = [...meshes];
    selectedIds.forEach(id => { newMeshes[id] = { ...newMeshes[id], color: color }; });
    setMeshes(newMeshes); saveToHistory(newMeshes);
  };

  const deleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    const newMeshes = meshes.filter((_, i) => !selectedIds.has(i));
    setMeshes(newMeshes); setSelectedIds(new Set()); saveToHistory(newMeshes);
  }, [meshes, selectedIds, saveToHistory]);

  useEffect(() => {
    const handleKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); selectAll(); }
      if (e.key === 'Delete') deleteSelected();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [undo, redo, deleteSelected, selectAll]);

  // --- FILE HANDLING ---
  const handleFileUpload = async (event) => {
    const inputElement = event.target;
    const files = inputElement.files;
    if (!files || files.length === 0) return;
    
    setLoading(true);
    
    try {
      const newParts = Array.from(files).map(file => ({
        name: file.name,
        // Using Blob URL is instantaneous and highly memory efficient!
        file_data: URL.createObjectURL(file), 
        position: [0, 0, 0], 
        rotation: [0, 0, 0], 
        color: "#e3e3e3" 
      }));
      
      const combined = [...meshes, ...newParts];
      setMeshes(combined); saveToHistory(combined);
    } catch (error) { console.error(error); alert("Error loading files: " + error.message); }
    
    setLoading(false);
    inputElement.value = ''; 
  };

  const spawnImplant = async (filename) => {
    setLoading(true);
    try {
      // Load static file directly from public folder
      const newMesh = {
        name: filename,
        file_data: `/implants/${filename}`,
        position: [0, 0, 0], rotation: [0, 0, 0], color: "#00bcd4"
      };
      const combined = [...meshes, newMesh];
      setMeshes(combined); saveToHistory(combined);
    } catch (err) { alert(err.message); }
    setLoading(false);
  };

  const fmt = (val) => unit === "mm" ? val.toFixed(1) : (val / 25.4).toFixed(2);
  const fmtVol = (val) => unit === "mm" ? val.toFixed(0) : (val / 16387).toFixed(3);

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#1a1a1a", fontFamily: "sans-serif", overflow: "hidden" }}>
      
      {/* LEFT SIDEBAR */}
      <div style={{ position: "absolute", top: 20, left: 20, zIndex: 10, color: "white", width: "260px", display: "flex", flexDirection: "column", gap: "10px", maxHeight: "90vh", overflowY: "auto" }}>
        <div><h1 style={{margin: 0, fontSize: "1.5rem", color: "#4db6ac"}}>Shalya Saarthi</h1><p style={{margin: 0, opacity: 0.6, fontSize: "0.8rem"}}>Surgical Planning Suite</p></div>
        
        <input type="file" accept=".stl" multiple onChange={handleFileUpload} style={{ padding: "8px", background: "#333", color: "white", border: "1px solid #555", borderRadius: "4px" }} />
        {loading && <p style={{color: "yellow", fontSize: "0.8rem"}}>Processing...</p>}
        
        {meshes.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", gap: "5px" }}>
              <button onClick={undo} disabled={historyIndex <= 0} style={{flex:1, background: "#444", color: "white", border: "none", padding: "8px", cursor: "pointer", opacity: historyIndex <= 0 ? 0.3 : 1}}>↶ UNDO</button>
              <button onClick={redo} disabled={historyIndex >= history.length - 1} style={{flex:1, background: "#444", color: "white", border: "none", padding: "8px", cursor: "pointer", opacity: historyIndex >= history.length - 1 ? 0.3 : 1}}>REDO ↷</button>
              <button onClick={() => setUnit(unit === "mm" ? "inch" : "mm")} style={{flex:1, background: "#009688", color: "white", border: "none", padding: "8px", cursor: "pointer"}}>{unit.toUpperCase()}</button>
            </div>
            
            <div style={{ background: "#263238", padding: "10px", borderRadius: "6px", border: "1px solid #37474f" }}>
              <p style={{marginTop:0, fontSize:"0.75rem", color:"#90a4ae", borderBottom:"1px solid #455a64"}}>TOOLS</p>
              
              <div style={{display: "flex", gap: "5px", marginBottom: "10px"}}>
                <button onClick={() => setControlMode("translate")} style={{flex: 1, background: controlMode === "translate" ? "#80cbc4" : "#37474f", color: controlMode === "translate"?"black":"white", border: "none", padding: "6px", cursor: "pointer"}}>MOVE</button>
                <button onClick={() => setControlMode("rotate")} style={{flex: 1, background: controlMode === "rotate" ? "#80cbc4" : "#37474f", color: controlMode === "rotate"?"black":"white", border: "none", padding: "6px", cursor: "pointer"}}>ROTATE</button>
              </div>

              {/* SNAPPING INPUTS */}
              <div style={{display: "flex", gap: "5px", marginBottom: "10px"}}>
                <div style={{flex: 1}}>
                    <label style={{fontSize: "0.7rem", color: "#ccc", display: "block"}}>Snap Move (mm)</label>
                    <input 
                        type="number" 
                        value={snapTrans} 
                        onChange={(e) => setSnapTrans(parseFloat(e.target.value) || 0)} 
                        step="0.1"
                        style={{width: "100%", background: "#444", border: "1px solid #555", color: "white", padding: "4px", fontSize: "0.8rem", borderRadius: "3px"}} 
                    />
                </div>
                <div style={{flex: 1}}>
                    <label style={{fontSize: "0.7rem", color: "#ccc", display: "block"}}>Snap Rot (deg)</label>
                    <input 
                        type="number" 
                        value={snapRot} 
                        onChange={(e) => setSnapRot(parseFloat(e.target.value) || 0)} 
                        step="1"
                        style={{width: "100%", background: "#444", border: "1px solid #555", color: "white", padding: "4px", fontSize: "0.8rem", borderRadius: "3px"}} 
                    />
                </div>
              </div>

              <div style={{display: "flex", gap: "5px", justifyContent: "space-between", marginBottom: "10px"}}>
                 {['#e3e3e3', '#ef5350', '#66bb6a', '#42a5f5', '#ab47bc', '#ffca28'].map(c => (
                   <div key={c} onClick={() => applyColor(c)} style={{width: "25px", height: "25px", background: c, borderRadius: "50%", cursor: "pointer", border: "2px solid #333"}} />
                 ))}
              </div>
              <div style={{display: "flex", gap: "5px", marginBottom: "5px"}}>
                <button onClick={selectAll} style={{flex: 1, background: "#546e7a", color: "white", fontSize: "0.7rem", border: "none", padding: "8px", cursor: "pointer", borderRadius: "4px"}}>SELECT ALL</button>
                <button onClick={deleteSelected} disabled={selectedIds.size === 0} style={{flex: 1, background: "#ef5350", color: "white", fontSize: "0.7rem", border: "none", padding: "8px", cursor: "pointer", borderRadius: "4px"}}>DELETE</button>
              </div>
              <div style={{display: "flex", gap: "5px"}}>
                <button onClick={alignSelectionToOrigin} disabled={selectedIds.size === 0} style={{flex: 1, background: "#78909c", color: "white", fontSize: "0.7rem", border: "none", padding: "8px", cursor: "pointer", borderRadius: "4px"}}>ALIGN CENTER</button>
                <button onClick={alignSelectionToFloor} disabled={selectedIds.size === 0} style={{flex: 1, background: "#78909c", color: "white", fontSize: "0.7rem", border: "none", padding: "8px", cursor: "pointer", borderRadius: "4px"}}>ALIGN FLOOR</button>
              </div>
            </div>

            <div style={{ background: "#111", padding: "12px", fontFamily: "monospace", fontSize: "0.8rem", color: "#80cbc4", border: "1px solid #333", borderRadius: "4px" }}>
              <p style={{margin:0, color: "#fff", borderBottom: "1px solid #333", marginBottom:"5px"}}>STATIC DATA</p>
              {selectedIds.size > 0 ? (
                <>
                  <p style={{margin:0}}>Vol : {fmtVol(stats.volume)} {unit === "mm" ? "mm³" : "in³"}</p>
                  <p style={{margin:0}}>Box : {fmt(stats.dims.x)} x {fmt(stats.dims.y)} x {fmt(stats.dims.z)}</p>
                </>
              ) : <p style={{color: "#555"}}>Select bones...</p>}
            </div>
            
            <button onClick={() => setDownloadTrigger(true)} style={{width: "100%", background: "#ff9800", color: "black", fontWeight: "bold", border: "none", padding: "12px", cursor: "pointer", borderRadius: "4px"}}>DOWNLOAD PLAN</button>
            <button onClick={() => setSelectedIds(new Set())} disabled={selectedIds.size === 0} style={{width: "100%", background: "#444", color: "white", border: "none", padding: "8px", cursor: "pointer", borderRadius: "4px"}}>DESELECT (Esc)</button>
          </div>
        )}
      </div>

      {/* RIGHT SIDEBAR */}
      <div style={{ position: "absolute", top: 20, right: 20, zIndex: 10, color: "white", width: "220px", display: "flex", flexDirection: "column", gap: "10px", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{background: "#263238", padding: "15px", borderRadius: "8px", border: "1px solid #37474f"}}>
          <h3 style={{margin:0, fontSize:"1rem", color: "#80cbc4"}}>Implant Library</h3>
          <p style={{margin:0, fontSize:"0.7rem", color: "#b0bec5", marginBottom: "10px"}}>Folder: backend/implants</p>
          <div style={{display: "flex", flexDirection: "column", gap: "5px"}}>
            {implantList.length === 0 ? (
              <p style={{fontSize: "0.7rem", color: "#ffab91", fontStyle: "italic"}}>No files in 'implants' folder.</p>
            ) : (
              implantList.map((filename, i) => (
                <button 
                  key={i} 
                  onClick={() => spawnImplant(filename)}
                  style={{
                    background: "#37474f", color: "white", border: "1px solid #455a64", 
                    padding: "8px", cursor: "pointer", textAlign: "left", fontSize: "0.75rem", borderRadius: "4px",
                    display: "flex", alignItems: "center", gap: "5px"
                  }}
                >
                  <span style={{color: "#00bcd4", fontWeight: "bold"}}>+</span> {filename.length > 20 ? filename.slice(0, 18)+"..." : filename}
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* HUD */}
      {selectedIds.size > 0 && (
        <div style={{ position: "absolute", bottom: 20, left: 20, zIndex: 20, background: "rgba(0,0,0,0.8)", padding: "15px", borderRadius: "8px", border: "2px solid #555", pointerEvents: "none" }}>
          <p style={{margin:0, color: "#fff", fontSize: "0.9rem", borderBottom: "1px solid #555", paddingBottom: "5px"}}>LIVE TRANSFORM</p>
          <div style={{ color: "#ff0000", fontFamily: "monospace", fontWeight: "bold", fontSize: "1.1rem", marginTop: "5px" }}>
            <p style={{margin:0}}>X : {fmt(liveStats.x)} {unit}</p>
            <p style={{margin:0}}>Y : {fmt(liveStats.y)} {unit}</p>
            <p style={{margin:0}}>Z : {fmt(liveStats.z)} {unit}</p>
            <hr style={{borderColor: "#333", margin: "5px 0"}}/>
            <p style={{margin:0}}>RX: {(liveStats.rx * 57.29).toFixed(1)}°</p>
            <p style={{margin:0}}>RY: {(liveStats.ry * 57.29).toFixed(1)}°</p>
            <p style={{margin:0}}>RZ: {(liveStats.rz * 57.29).toFixed(1)}°</p>
          </div>
        </div>
      )}

      {/* SCENE */}
      <Canvas camera={{ position: [300, 300, 300], fov: 45, near: 0.1, far: 100000 }}>
        <color attach="background" args={['#101010']} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[50, 50, 50]} intensity={1} />
        <directionalLight position={[-50, -50, -20]} intensity={0.4} />
        <axesHelper args={[50]} />
        <gridHelper args={[500, 50, 0x444444, 0x222222]} position={[0, -0.1, 0]} />
        <GizmoHelper alignment="bottom-right" margin={[80, 80]}><GizmoViewcube /></GizmoHelper>
        <SceneExporter triggerDownload={downloadTrigger} setTriggerDownload={setDownloadTrigger} />
        
        {meshes.map((meshData, index) => (
            <Suspense key={index} fallback={null}>
                <Model 
                index={index} url={meshData.file_data} 
                isSelected={selectedIds.has(index)} color={meshData.color}
                position={meshData.position} rotation={meshData.rotation}
                registerRef={registerRef}
                onClick={(e) => { e.stopPropagation(); handleSelect(index, e.ctrlKey); }}
                />
            </Suspense>
        ))}
        
        <Suspense fallback={null}>
            {activeId !== undefined && meshRefs.current[activeId] && (
                <TransformControls 
                object={meshRefs.current[activeId]} 
                mode={controlMode}
                translationSnap={snapTrans > 0 ? snapTrans : null}
                rotationSnap={snapRot > 0 ? THREE.MathUtils.degToRad(snapRot) : null}
                onMouseDown={onTransformStart} 
                onChange={onTransformChange} 
                onMouseUp={onTransformEnd}
                />
            )}
        </Suspense>
        
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}