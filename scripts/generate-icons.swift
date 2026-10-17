import AppKit

let repoRoot = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let pngURL = repoRoot.appendingPathComponent("logo/logo.png")

guard let pngData = try? Data(contentsOf: pngURL),
      let srcImage = NSImage(data: pngData) else {
    print("Error: Could not load \(pngURL.path)")
    exit(1)
}

print("Loaded logo from \(pngURL.path) size: \(srcImage.size)")

// 渲染符合 macOS HIG 规范的圆角卡片应用图标
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
    NSColor(red: 250.0/255.0, green: 250.0/255.0, blue: 250.0/255.0, alpha: 1.0).setFill()
    cardPath.fill()
    
    NSGraphicsContext.restoreGraphicsState()
    
    // 绘制 Logo
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    
    let clip = NSBezierPath(roundedRect: NSRect(x: origin, y: origin, width: cardSize, height: cardSize), xRadius: radius, yRadius: radius)
    clip.addClip()
    
    // Logo 居中绘制在卡片内
    let logoInset = cardSize * 0.08
    let logoRect = NSRect(x: origin + logoInset, y: origin + logoInset, width: cardSize - logoInset * 2, height: cardSize - logoInset * 2)
    srcImage.draw(in: logoRect, from: .zero, operation: .sourceOver, fraction: 1.0)
    
    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])
}

// 生成完整的 macOS AppIcon.iconset
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

// 用 iconutil 编译为 AppIcon.icns
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
