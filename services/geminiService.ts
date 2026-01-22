import { 
  GoogleGenerativeAI, 
  ChatSession, 
  Content, 
  HarmCategory, 
  HarmBlockThreshold 
} from "@google/generative-ai";
import { SYSTEM_INSTRUCTION } from "../constants";

// --- API KEY MANAGEMENT ---
const API_KEYS = [
  "AIzaSyDHsKZv9zk5VN9tlqZ9Ffhl294i-BunRD0",
  "AIzaSyAdmzKq5c0PVqur7WygvyblnfsBY8e1rzE",
  "AIzaSyDlazOs2TixDhZrvP9pKZ2F23aABhnhDnw"
];

// Usando o modelo flash que é mais rápido e menos propenso a overload em tier gratuito
const TEXT_MODEL = "gemini-1.5-flash";

// --- CONFIGURAÇÕES DE SEGURANÇA (CRÍTICO PARA O MENTOR) ---
// O Mentor tem uma personalidade forte. Sem isso, o Gemini bloqueia as respostas.
const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// --- STATE MANAGEMENT ---
let currentChatSession: ChatSession | null = null;
let currentKeyIndex = 0;
let currentClient: GoogleGenerativeAI | null = null;

// --- INTERNAL HELPERS ---

const getClient = (): GoogleGenerativeAI => {
  if (!currentClient) {
      currentClient = new GoogleGenerativeAI(API_KEYS[currentKeyIndex]);
  }
  return currentClient;
};

const rotateKey = (): boolean => {
  const nextIndex = currentKeyIndex + 1;
  if (nextIndex >= API_KEYS.length) {
    currentKeyIndex = 0; 
    currentClient = null;
    return false; 
  }
  currentKeyIndex = nextIndex;
  currentClient = null;
  console.log(`[Mentor System] Rotating to API Key Index: ${currentKeyIndex}`);
  return true;
};

const initSession = async (history: Content[] = []): Promise<ChatSession> => {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({ 
      model: TEXT_MODEL,
      systemInstruction: SYSTEM_INSTRUCTION,
      safetySettings: SAFETY_SETTINGS // Aplicando configurações de segurança
  });
  
  currentChatSession = model.startChat({
    history: history,
    generationConfig: {
      temperature: 0.8, // Aumentado levemente para mais criatividade no tom
      maxOutputTokens: 1000,
    },
  });
  
  return currentChatSession;
};

// --- PUBLIC METHODS ---

export const sendMessageToGemini = async (
  message: string,
  imagePart?: { mimeType: string; data: string }
): Promise<string> => {
  
  let attempts = 0;
  const maxAttempts = API_KEYS.length;

  while (attempts < maxAttempts) {
    try {
      if (!currentChatSession) {
        await initSession();
      }

      if (!currentChatSession) throw new Error("Session failed to initialize");
      
      let result;
      
      if (imagePart) {
           result = await currentChatSession.sendMessage([
               message,
               { inlineData: { mimeType: imagePart.mimeType, data: imagePart.data } }
           ]);
      } else {
           result = await currentChatSession.sendMessage(message);
      }

      const response = await result.response;
      return response.text();

    } catch (error: any) {
      console.warn(`[Mentor AI] Error with Key ${currentKeyIndex}:`, error);
      
      // Se for erro de segurança, não adianta trocar a chave, mas vamos tentar.
      if (error.message && error.message.includes("SAFETY")) {
          return "O Mentor foi silenciado pelos protocolos de segurança. Tente reformular sua frase de forma menos 'extrema'.";
      }

      attempts++;

      // Tenta recuperar histórico para não perder o contexto na troca de chave
      let history: Content[] = [];
      try {
        if (currentChatSession) {
           history = await currentChatSession.getHistory();
        }
      } catch (hErr) {
        // Ignora erro de histórico
      }

      const hasNextKey = rotateKey();
      currentChatSession = null; 

      if (hasNextKey || attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 800)); // Delay um pouco maior
        await initSession(history);
        continue;
      }
    }
  }

  return "ERRO CRÍTICO: Sistema sobrecarregado ou bloqueado. Tente novamente em 1 minuto.";
};

export const generateMindMapText = async (topic: string): Promise<string | null> => {
  const prompt = `
    ATUE COMO UM ESTRATEGISTA DE ELITE.
    Crie um Mapa Mental hierárquico (formato de texto identado) para resolver esta confusão: "${topic}".
    
    REGRAS:
    1. Use apenas texto puro.
    2. Use hierarquia com marcadores (-, *, +).
    3. Seja brutalmente prático. Nada de teoria. Apenas ações.
    
    Retorne APENAS o mapa.
  `;

  let attempts = 0;
  
  while (attempts < API_KEYS.length) {
    try {
      const genAI = getClient();
      const model = genAI.getGenerativeModel({ 
          model: TEXT_MODEL,
          safetySettings: SAFETY_SETTINGS 
      });
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();

    } catch (error) {
      console.error("Mind Map generation error:", error);
      attempts++;
      rotateKey();
      await new Promise(r => setTimeout(r, 800));
    }
  }

  return null;
};