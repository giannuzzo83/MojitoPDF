# PDFDiet

App desktop Windows per alleggerire documenti PDF in locale, con tre preset di qualità.

## Requisiti

- **Node.js** 20+ (per sviluppo)
- **Ghostscript** (obbligatorio a runtime)

Scarica Ghostscript da: https://ghostscript.com/releases/gsdnld.html  
Installa la versione **Windows (64 bit)** e verifica che `gswin64c` sia nel PATH, oppure lascia l’installer nella cartella predefinita `C:\Program Files\gs\...` — PDFDiet la rileva automaticamente.

## Preset qualità

| Preset | Motore | Uso tipico |
|--------|--------|------------|
| **Ultra** | Custom (~36 dpi + JPEG aggressivo) | Compressione estrema (~70%+ su PDF con immagini) |
| **Bassa** | `/screen` | Forte riduzione (~72 dpi), email / schermo |
| **Media** | `/ebook` | Bilanciato (~150 dpi) — default |
| **Alta** | `/printer` | Qualità più alta (~300 dpi), stampa |

## Sviluppo

```bash
npm install
npm run dev
```

## Build installer Windows

```bash
npm run electron:build
```

L’installer viene generato in `release/` (es. `PDFDiet-Setup-1.0.0.exe`).

## Uso

1. Avvia PDFDiet
2. Trascina un PDF o scegli il file — vedi subito la **dimensione attuale** e l’**anteprima** (size finale stimata + % risparmio)
3. Scegli la modalità:
   - **Preset qualità**: Ultra / Bassa / Media / Alta (l’anteprima ricalcola in automatico)
   - **Dimensione target**: indica i MB desiderati; PDFDiet cerca la qualità più alta che stia entro il target
4. Clicca **Comprimi** (salva come `nome_diet.pdf`) oppure **Scegli dove salvare…**

I file non lasciano mai il tuo PC.
