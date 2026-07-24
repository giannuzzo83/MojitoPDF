# MojitoPDF

App desktop Windows per alleggerire documenti PDF in locale, con preset di qualità, dimensione target e opzione di appiattimento pagine.

## Download

Scarica l’installer Windows pronto all’uso da [`release/MojitoPDF-Setup-1.0.0.exe`](release/MojitoPDF-Setup-1.0.0.exe).  
Serve anche **Ghostscript** (vedi sotto).

## Requisiti

- **Node.js** 20+ (per sviluppo)
- **Ghostscript** (obbligatorio a runtime)

Scarica Ghostscript da: https://ghostscript.com/releases/gsdnld.html  
Installa la versione **Windows (64 bit)** e verifica che `gswin64c` sia nel PATH, oppure lascia l’installer nella cartella predefinita `C:\Program Files\gs\...` — MojitoPDF la rileva automaticamente.

## Preset qualità

| Preset | Motore | Uso tipico |
|--------|--------|------------|
| **Ultra** | Custom / raster JPEG | Compressione estrema |
| **Bassa** | `/screen` o raster | Forte riduzione, email / schermo |
| **Media** | `/ebook` o raster | Bilanciato — default |
| **Alta** | `/printer` o raster | Qualità più alta |

## Sviluppo

```bash
npm install
npm run dev
```

## Build installer Windows

```bash
npm run electron:build
```

L’installer viene generato in `release/` (es. `MojitoPDF-Setup-1.0.0.exe`).

## Uso

1. Avvia MojitoPDF
2. Trascina un PDF o scegli il file
3. Scegli la modalità:
   - **Preset qualità**: Ultra / Bassa / Media / Alta
   - **Dimensione target**: indica i MB desiderati
4. Opzione **Appiattisci in un’unica immagine** (attiva di default) per ridurre di più
5. Clicca **Comprimi** (salva come `nome_mojito.pdf`) oppure **Scegli dove salvare…**

I file non lasciano mai il tuo PC.
