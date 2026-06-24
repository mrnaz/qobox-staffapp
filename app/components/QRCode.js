import React, { useMemo } from 'react';
import { View } from 'react-native';
import qrcode from 'qrcode-generator';

// Lightweight QR renderer with NO native dependency: it uses the pure-JS
// `qrcode-generator` to compute the module matrix and draws it as a grid of
// <View> cells. Dark-on-white with a quiet zone so kiosk scanners read it.
//
// Props:
//   value      string|number — the data to encode (e.g. the staff id)
//   size       number         — target TOTAL side length in dp (modules + quiet zone)
//   color      string         — dark module colour (default black)
//   background string         — light module / quiet-zone colour (default white)
//   ecl        'L'|'M'|'Q'|'H'— error-correction level (default 'M')
//   quietZone  number         — quiet-zone width in modules (default 4, per spec)
export default function QRCode({
    value,
    size = 220,
    color = '#000000',
    background = '#ffffff',
    ecl = 'M',
    quietZone = 4,
}) {
    const matrix = useMemo(() => {
        const data = value == null ? '' : String(value);
        try {
            const qr = qrcode(0, ecl); // typeNumber 0 → auto-pick smallest version
            qr.addData(data);
            qr.make();
            const count = qr.getModuleCount();
            const rows = [];
            for (let r = 0; r < count; r++) {
                const row = [];
                for (let c = 0; c < count; c++) row.push(qr.isDark(r, c));
                rows.push(row);
            }
            return { count, rows };
        } catch {
            return { count: 0, rows: [] };
        }
    }, [value, ecl]);

    if (matrix.count === 0) return null;

    // Integer module size avoids sub-pixel gaps between cells (which can break
    // scanning). Size for the FULL footprint — modules plus a quiet zone on both
    // sides — so the whole code fits inside `size` and never overflows/clips its
    // container. The drawn QR may be slightly smaller than `size`.
    const moduleSize = Math.max(2, Math.floor(size / (matrix.count + quietZone * 2)));
    const quiet = moduleSize * quietZone;

    return (
        <View style={{ backgroundColor: background, padding: quiet }}>
            {matrix.rows.map((row, r) => (
                <View key={r} style={{ flexDirection: 'row' }}>
                    {row.map((dark, c) => (
                        <View
                            key={c}
                            style={{
                                width: moduleSize,
                                height: moduleSize,
                                backgroundColor: dark ? color : background,
                            }}
                        />
                    ))}
                </View>
            ))}
        </View>
    );
}
