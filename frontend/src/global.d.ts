/// <reference types="vite/client" />
/// <reference types="react" />

// Browser SpeechRecognition (vendor-prefixed names)
// These are minimal declarations to make TypeScript and editors happy.
// They intentionally use `any` for some fields because implementations differ between browsers.

interface SpeechRecognitionEvent extends Event {
  readonly results: any;
  readonly resultIndex: number;
}

interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
  length: number;
}

interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
  length: number;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onaudioend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onerror: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface Window {
  webkitSpeechRecognition?: {
    prototype: SpeechRecognition;
    new (): SpeechRecognition;
  };
  SpeechRecognition?: {
    prototype: SpeechRecognition;
    new (): SpeechRecognition;
  };
}
