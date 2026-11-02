# Vii-Maker

**A browser-based editor for Minecraft Bedrock resource packs that generates up to 1.8 million unique villagers**

Vii-Maker is a client-side / resource-pack-only tool for Minecraft Bedrock.  
It uses a Mii-style combinatorial system (geometry + texture + color variations) so every villager can be visually distinct and easy to identify at a distance.  
Design villagers in the browser, then export a ready-to-use resource pack.

Live editor: https://vii-maker.vercel.app/

## Purpose

Vanilla Bedrock villagers are hard to tell apart.  
Vii-Maker solves that by letting creators generate large sets of unique-looking villagers through modular geometry, texture, and color combinations.  
The result is a pure resource pack (no behavior packs or scripts required) that works on any Bedrock client that accepts resource packs.

## Features

* **Combinatorial Villager Generation**  
  Modular system of geometries, textures, and tints that can produce on the order of 1.8 million unique appearances.

* **Live 3D Preview**  
  Real-time viewer to inspect models, materials, and tints before exporting.

* **Resource-Pack Export**  
  Easy export of a complete Bedrock resource pack containing the custom villager assets.

* **Client-Side Only**  
  Pure resource pack : no behavior packs, no scripts, no server requirements. Works on realms.

* **Plaza / Gallery Workflow**  
  Save and organize designs (Plaza) for batch work or sharing.

* **Audio Feedback**  
  Optional music and SFX toggles for a more polished editor experience.

## Technical Highlights

* Built with **Vite** + modern ES modules.
* Custom geometry, rigging, tinting, and TGA handling for Bedrock-compatible assets.

## Installation / Local Development

```bash
git clone https://github.com/PianoPsycopath/Vii-Maker.git
cd Vii-Maker
npm install
npm run dev
