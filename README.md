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

<table width="100%">
  <tr>
    <td width="50%" align="center">
      <img src="https://github.com/user-attachments/assets/921794ab-6e2b-4e31-bdd8-6c481a56f0e2" width="100%" alt="Scale 1"><br>
      <em>Plaza</em>
    </td>
    <td width="50%" align="center">
      <img src="https://github.com/user-attachments/assets/4b7c93ed-ceb2-4f5d-9ce8-d3f23e3c932a" width="100%" alt="Scale 2"><br>
      <em>Parade</em>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="https://github.com/user-attachments/assets/fa465441-6f59-432c-8e34-f0e7c69a5866" width="100%" alt="Scale 3"><br>
      <em>Editor</em>
    </td>
    <td width="50%" align="center">
      <img src="https://github.com/user-attachments/assets/5aefa2a2-9d54-4a8a-b62e-e7046fb02955" width="100%" alt="Scale 4"><br>
      <em>Profession and Skins</em>
    </td>
  </tr>
</table>



## Technical Highlights

* Built with **Vite** + modern ES modules.
* Custom geometry, rigging, tinting, and TGA handling for Bedrock-compatible assets.

## Installation / Local Development

```bash
git clone https://github.com/PianoPsycopath/Vii-Maker.git
cd Vii-Maker
npm install
npm run dev
