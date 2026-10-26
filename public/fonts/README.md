# Report PDF fonts

The bundled regular (400) and bold (700) faces are static instances of the Noto
Sans SC and Noto Sans KR variable fonts previously stored in this repository at
commit `d1c5f108c763fe88373ebec16876cda42525e7a5`. Static instances give PDFKit the
correct weights without relying on system fonts or runtime font downloads.

Generated with FontTools 4.61.1 using
`fontTools.varLib.instancer.instantiateVariableFont(font, {"wght": weight}, updateFontNames=True)`
for weights 400 and 700. The previous variable files defaulted to weight 100.

Source file hashes:

- `NotoSansSC-Regular.ttf` SHA-256: `a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da`
- `NotoSansKR-Variable.ttf` SHA-256: `194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252`

The existing `LICENSE-NotoSansSC.txt` and `LICENSE-NotoSansKR.txt` apply to both
weights. FontTools is needed only to regenerate font assets, not to build or run
the application.
