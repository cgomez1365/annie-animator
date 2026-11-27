---
name: 3d-print-pipeline
description: Parametric 3D modeling (CadQuery / OpenSCAD) → STL export → slicing (Flash Studio / OrcaSlicer) → FDM printing on a Flashforge Adventurer 5M. Includes collision testing, build guides and print-ready STL sets.
---

# 3D print pipeline (t7.4)

Prerequisites: t7.2 (mesh turntable — for preview renders of STLs). Source: `3d/` workspace.

## When to use

When you need a physical object: a holiday decoration set, a shelf tower, a custom enclosure, a prototype part. The pipeline goes from code to a printed object on the desk.

## Technique

### 1. Parametric modeling

Two engines, pick by task:

| Engine | Best for | Language |
|--------|----------|----------|
| **CadQuery** | Organic shapes, fillets, chamfers, assemblies | Python |
| **OpenSCAD** | Geometric / modular designs, parametric dimensions, test scripts | OpenSCAD (functional) |

Both export watertight STL or 3MF. **Blender** is available for freeform / sculpted models (export STL).

### 2. Collision and contact testing

OpenSCAD test scripts (`tower_tests.scad` pattern): render each pair of parts, check for intersection volume > 0 (collision) or overlap in the 0.1–0.3 mm range (intentional contact / press fit). Automated via `openscad --export-format binstl`.

### 3. Slicing

**Flash Studio** (Orca-Flashforge fork) or **OrcaSlicer**. Key settings per material:

| Material | Nozzle | Bed | Fan | Notes |
|----------|--------|-----|-----|-------|
| PLA+ | 215°C | 60°C | 100% after layer 3 | 5–6 top layers for flat surfaces |
| PETG | 240°C | 80°C | 50% | Stringing: retract 1.5 mm |
| TPU | 220°C | 50°C | off | Direct drive only, 20 mm/s |

Tree supports for overhangs > 45°. Orient for strength (layer lines ⊥ to load).

### 4. Printing

Flashforge Adventurer 5M (Core XY, 220×220×220 mm). USB or LAN transfer. `ad5m_watcher.py` monitors print progress over TCP (port 8899), logs temperature and ETA.

### 5. Deliverables

Per design: print-ready STLs in `print_ready/`, build guide (Markdown), specs and print plan, preview renders (t7.2 turntable or screenshots).

## Dependencies

- CadQuery (`cadquery` + `trimesh` in a venv) or OpenSCAD (cask `openscad@snapshot`)
- Flash Studio or OrcaSlicer
- Blender (optional, for freeform modeling)
- Python 3.10+ (for watcher and CadQuery scripts)
- Flashforge Adventurer 5M (or any FDM printer with G-code support)

## Quality bar

- STL is watertight (no non-manifold edges)
- Collision tests pass (no unintended intersections)
- Build guide includes material, orientation, support and temperature
- Print-ready folder has one STL per printable part
