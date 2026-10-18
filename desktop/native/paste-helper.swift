// dictator-paste: the macOS calls behind Auto-Paste (src/main/autoPaste.js), run by the main
// process as a separate small program. Every command prints one JSON line and exits.
//   front                       the frontmost app (NSWorkspace). Needs no permission.
//   inspect <pid>               that app's focused element through the Accessibility API, and
//                               whether macOS secure input (a password field) is on
//   paste <pid> <expectedChars> checks again that <pid> is in front and no password field is
//                               focused, posts one ⌘V (key down, key up), then reads the field's
//                               length for up to a second to see whether the text went in
// macOS attributes what this program does to Dictator, the app that started it, so it uses
// Dictator's Accessibility access. It never types text, presses other keys, changes another
// app's text directly or brings an app to the front.
import AppKit
import ApplicationServices
import Carbon

func emit(_ object: [String: Any]) -> Never {
  let data = try! JSONSerialization.data(withJSONObject: object)
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
  exit(0)
}

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
  var value: CFTypeRef?
  return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
}

func string(_ element: AXUIElement, _ name: String) -> Any {
  (attribute(element, name) as? String) ?? NSNull()
}

func characterCount(_ element: AXUIElement) -> Int? {
  (attribute(element, kAXNumberOfCharactersAttribute) as? NSNumber)?.intValue
}

func frontmost() -> [String: Any]? {
  guard let app = NSWorkspace.shared.frontmostApplication else { return nil }
  return ["pid": Int(app.processIdentifier), "bundleId": app.bundleIdentifier ?? NSNull(), "name": app.localizedName ?? NSNull()]
}

func focusedElement(_ pid: pid_t) -> AXUIElement? {
  let app = AXUIElementCreateApplication(pid)
  AXUIElementSetMessagingTimeout(app, 1.0)
  guard let value = attribute(app, kAXFocusedUIElementAttribute), CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
  let element = value as! AXUIElement
  AXUIElementSetMessagingTimeout(element, 1.0)
  return element
}

func describe(_ element: AXUIElement) -> [String: Any] {
  var owner: pid_t = 0
  AXUIElementGetPid(element, &owner)
  var settable: DarwinBoolean = false
  let canSet = AXUIElementIsAttributeSettable(element, kAXValueAttribute as CFString, &settable) == .success && settable.boolValue
  var selection: Any = NSNull()
  if let value = attribute(element, kAXSelectedTextRangeAttribute), CFGetTypeID(value) == AXValueGetTypeID() {
    var range = CFRange()
    if AXValueGetValue(value as! AXValue, .cfRange, &range) { selection = ["location": range.location, "length": range.length] }
  }
  return [
    "pid": Int(owner),
    "role": string(element, kAXRoleAttribute),
    "subrole": string(element, kAXSubroleAttribute),
    "settable": canSet,
    "chars": characterCount(element) ?? NSNull(),
    "selection": selection,
  ]
}

func isSecure(_ facts: [String: Any]) -> Bool {
  (facts["role"] as? String) == kAXSecureTextFieldSubrole || (facts["subrole"] as? String) == kAXSecureTextFieldSubrole
}

// The key that types "v" in the current keyboard layout (it is not the same key in every layout),
// or, for layouts without one, in the ASCII-capable layout macOS uses for shortcuts.
func keyCodeForV() -> CGKeyCode? {
  let sources = [TISCopyCurrentKeyboardLayoutInputSource(), TISCopyCurrentASCIICapableKeyboardLayoutInputSource()]
  for case let source? in sources {
    let layoutSource = source.takeRetainedValue()
    guard let pointer = TISGetInputSourceProperty(layoutSource, kTISPropertyUnicodeKeyLayoutData) else { continue }
    let data = Unmanaged<CFData>.fromOpaque(pointer).takeUnretainedValue() as Data
    let found: CGKeyCode? = data.withUnsafeBytes { raw in
      guard let base = raw.baseAddress else { return nil }
      let layout = base.assumingMemoryBound(to: UCKeyboardLayout.self)
      for code in 0..<128 {
        var deadKeys: UInt32 = 0
        var chars = [UniChar](repeating: 0, count: 4)
        var length = 0
        let status = UCKeyTranslate(layout, UInt16(code), UInt16(kUCKeyActionDisplay), 0, UInt32(LMGetKbdType()),
                                    OptionBits(kUCKeyTranslateNoDeadKeysBit), &deadKeys, chars.count, &length, &chars)
        if status == noErr && length == 1 && chars[0] == 0x76 { return CGKeyCode(code) }
      }
      return nil
    }
    if let found { return found }
  }
  return nil
}

func postCommandV(_ key: CGKeyCode) -> Bool {
  guard let source = CGEventSource(stateID: .combinedSessionState),
        let down = CGEvent(keyboardEventSource: source, virtualKey: key, keyDown: true),
        let up = CGEvent(keyboardEventSource: source, virtualKey: key, keyDown: false) else { return false }
  down.flags = .maskCommand
  up.flags = .maskCommand
  down.post(tap: .cghidEventTap)
  up.post(tap: .cghidEventTap)
  return true
}

let args = CommandLine.arguments
let command = args.count > 1 ? args[1] : ""
let pid = args.count > 2 ? pid_t(args[2]) : nil

switch command {
case "front":
  emit(["front": frontmost() ?? NSNull()])

case "inspect":
  guard let pid else { emit(["error": "pid"]) }
  let trusted = AXIsProcessTrusted()
  let element = trusted ? focusedElement(pid) : nil
  emit([
    "trusted": trusted,
    "secureInput": IsSecureEventInputEnabled(),
    "front": frontmost() ?? NSNull(),
    "focused": element.map(describe) ?? NSNull(),
  ])

case "paste":
  guard let pid else { emit(["error": "pid"]) }
  let expected = args.count > 3 ? Int(args[3]) : nil
  guard AXIsProcessTrusted() else { emit(["posted": false, "reason": "accessibility"]) }
  guard let front = frontmost(), (front["pid"] as? Int) == Int(pid) else { emit(["posted": false, "reason": "app-changed"]) }
  guard let element = focusedElement(pid) else { emit(["posted": false, "reason": "no-target"]) }
  if IsSecureEventInputEnabled() || isSecure(describe(element)) { emit(["posted": false, "reason": "secure"]) }
  guard let key = keyCodeForV() else { emit(["posted": false, "reason": "failed"]) }
  guard postCommandV(key) else { emit(["posted": false, "reason": "failed"]) }
  var chars: Int? = nil
  if let expected {
    for _ in 0..<20 {
      usleep(50_000)
      chars = characterCount(element)
      if chars == expected { break }
    }
  }
  emit(["posted": true, "confirmed": expected != nil && chars == expected, "chars": chars ?? NSNull()])

default:
  emit(["error": "unknown command"])
}
