import AppKit

let repoRoot = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let pngURL = repoRoot.appendingPathComponent("logo/iFolo NOTE Logo.png")

guard let pngData = try? Data(contentsOf: pngURL),
      let srcImage = NSImage(data: pngData) else {
    print("Error: Could not load \(pngURL.path)")
    exit(1)
}

print("Loaded PNG from \(pngURL.path)")

// 1. 无损透明几何矢量 SVG (与 iFolo NOTE Logo.png 像素级重合)
let cleanSVG = """
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="100%" height="100%" fill="none">
  <!-- 橙色圆 (左上) -->
  <circle cx="238" cy="245" r="79.5" fill="#FFA51F"/>
  <!-- 灰色胶囊 (右上) -->
  <rect x="370" y="178" width="458" height="140" rx="70" fill="#C3C3C3"/>
  <!-- 蓝色通栏胶囊 (中部) -->
  <rect x="188" y="458" width="542" height="140" rx="70" fill="#5CA3FF"/>
  <!-- 绿色圆 (左下) -->
  <circle cx="254" cy="772.5" r="79.5" fill="#69CF3D"/>
</svg>
"""

let cleanSVGData = cleanSVG.data(using: .utf8)!

// 2. 更新 logo/iFolo_NOTE_Logo.svg 与 website/assets/logo.svg
let svgURL = repoRoot.appendingPathComponent("logo/iFolo_NOTE_Logo.svg")
try? cleanSVGData.write(to: svgURL)
let websiteLogoURL = repoRoot.appendingPathComponent("website/assets/logo.svg")
try? cleanSVGData.write(to: websiteLogoURL)
print("Updated logo/iFolo_NOTE_Logo.svg and website/assets/logo.svg")

// 3. 渲染符合 macOS HIG 规范的 1024x1024 圆角卡片应用图标
func renderSquircleAppIcon(size: Int) -> Data? {
    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: size,
        pixelsHigh: size,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: size * 4,
        bitsPerPixel: 32
    )!
    rep.size = NSSize(width: size, height: size)
    
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    
    let fSize = CGFloat(size)
    let cardSize = fSize * 0.824
    let origin = (fSize - cardSize) / 2.0
    let radius = cardSize * 0.2245
    
    // 阴影
    let shadow = NSShadow()
    shadow.shadowColor = NSColor.black.withAlphaComponent(0.18)
    shadow.shadowOffset = NSSize(width: 0, height: -fSize * 0.015)
    shadow.shadowBlurRadius = fSize * 0.03
    shadow.set()
    
    let cardPath = NSBezierPath(roundedRect: NSRect(x: origin, y: origin, width: cardSize, height: cardSize), xRadius: radius, yRadius: radius)
    NSColor(red: 249.0/255.0, green: 249.0/255.0, blue: 249.0/255.0, alpha: 1.0).setFill()
    cardPath.fill()
    
    NSGraphicsContext.restoreGraphicsState()
    
    // 绘制 Logo
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    
    let clip = NSBezierPath(roundedRect: NSRect(x: origin, y: origin, width: cardSize, height: cardSize), xRadius: radius, yRadius: radius)
    clip.addClip()
    srcImage.draw(in: NSRect(x: origin, y: origin, width: cardSize, height: cardSize), from: .zero, operation: .sourceOver, fraction: 1.0)
    
    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])
}

// 4. 更新 logo/logo.png (1024x1024)
if let png1024 = renderSquircleAppIcon(size: 1024) {
    let logoPNGURL = repoRoot.appendingPathComponent("logo/logo.png")
    try? png1024.write(to: logoPNGURL)
    print("Updated \(logoPNGURL.path)")
}

// 5. 生成完整的 macOS AppIcon.iconset
let iconsetDir = repoRoot.appendingPathComponent("apps/macos/Resources/AppIcon.iconset")
try? FileManager.default.removeItem(at: iconsetDir)
try? FileManager.default.createDirectory(at: iconsetDir, withIntermediateDirectories: true)

let iconSizes: [(String, Int)] = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024)
]

for (filename, size) in iconSizes {
    if let data = renderSquircleAppIcon(size: size) {
        let fileURL = iconsetDir.appendingPathComponent(filename)
        try? data.write(to: fileURL)
    }
}
print("Generated AppIcon.iconset with all 10 resolutions")

// 6. 用 iconutil 编译为 AppIcon.icns
let icnsURL = repoRoot.appendingPathComponent("apps/macos/Resources/AppIcon.icns")
let process = Process()
process.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
process.arguments = ["-c", "icns", iconsetDir.path, "-o", icnsURL.path]
try process.run()
process.waitUntilExit()

if process.terminationStatus == 0 {
    print("Successfully compiled \(icnsURL.path)")
    try? FileManager.default.removeItem(at: iconsetDir)
} else {
    print("Failed to compile icns: \(process.terminationStatus)")
    exit(1)
}
