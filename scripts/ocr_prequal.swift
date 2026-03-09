#!/usr/bin/env swift
import Foundation
import Vision
import AppKit

struct Result: Codable {
    let found: Bool
    let prequalification_id: String?
    let visible_text: String
    let confidence: String
}

func normalize(_ text: String) -> String {
    text.replacingOccurrences(of: "\r", with: "\n")
        .replacingOccurrences(of: "\t", with: " ")
}

func isLikelyId(_ value: String) -> Bool {
    value.range(of: #"[A-Z]"#, options: .regularExpression) != nil &&
    value.range(of: #"[0-9]"#, options: .regularExpression) != nil &&
    (10...20).contains(value.count)
}

func extractPrequalificationId(from text: String) -> String? {
    let normalized = normalize(text)
    let lines = normalized.components(separatedBy: .newlines)

    for (idx, line) in lines.enumerated() {
        if line.range(of: #"(?i)prequalification\s*id"#, options: .regularExpression) != nil {
            let window = lines[idx..<min(lines.count, idx + 3)].joined(separator: " ")
            let tail = window.replacingOccurrences(of: #"(?i)^.*?prequalification\s*id\s*(?:is)?\s*[:#]?"#, with: "", options: .regularExpression)
            let tokens = tail
                .components(separatedBy: CharacterSet.alphanumerics.inverted)
                .filter { !$0.isEmpty }
            if let exact = tokens.first(where: { isLikelyId($0.uppercased()) }) {
                return exact.uppercased()
            }
            let joined = tokens.joined().uppercased()
            if isLikelyId(joined) { return joined }
            if tokens.count >= 2 {
                let firstTwo = (tokens[0] + tokens[1]).uppercased()
                if isLikelyId(firstTwo) { return firstTwo }
            }
        }
    }

    let regex = try! NSRegularExpression(pattern: #"\b[A-Z0-9]{6,20}\b"#)
    let nsText = normalized as NSString
    let matches = regex.matches(in: normalized, range: NSRange(location: 0, length: nsText.length))
    let candidates = matches.map { nsText.substring(with: $0.range) }
    return candidates.first { isLikelyId($0) }
}

let args = CommandLine.arguments
guard args.count >= 2 else {
    fputs("Usage: ocr_prequal.swift <image_path>\n", stderr)
    exit(1)
}

let path = NSString(string: args[1]).expandingTildeInPath
let url = URL(fileURLWithPath: path)

guard let image = NSImage(contentsOf: url) else {
    fputs("Unable to load image: \(path)\n", stderr)
    exit(1)
}

guard let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fputs("Unable to decode CGImage: \(path)\n", stderr)
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
request.recognitionLanguages = ["en-US"]

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
    try handler.perform([request])
} catch {
    fputs("Vision OCR failed: \(error)\n", stderr)
    exit(1)
}

let observations: [VNRecognizedTextObservation] = request.results ?? []
let lines = observations.compactMap { $0.topCandidates(1).first?.string }
let text = normalize(lines.joined(separator: "\n"))
let chosen = extractPrequalificationId(from: text)

let result = Result(
    found: chosen != nil,
    prequalification_id: chosen,
    visible_text: String(text.prefix(500)),
    confidence: chosen != nil ? "high" : "low"
)

let data = try JSONEncoder().encode(result)
print(String(data: data, encoding: .utf8)!)
