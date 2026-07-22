import { VoiceAiView } from "@/components/voice/voice-ai-view";
import { VoiceCommercePanel } from "@/components/voice/voice-commerce-panel";

export default function VoiceAiPage() {
  return (
    <div className="space-y-8">
      <VoiceAiView />
      <VoiceCommercePanel />
    </div>
  );
}
