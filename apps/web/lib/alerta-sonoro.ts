"use client";

/**
 * Alerta sonoro gerado com Web Audio (sem arquivo de áudio). Navegadores só
 * liberam som depois de um toque/clique na página: `ativar()` deve ser
 * chamado num handler de clique.
 */
let contexto: AudioContext | null = null;

export function somAtivo(): boolean {
  return contexto?.state === "running";
}

export async function ativarSom(): Promise<boolean> {
  try {
    contexto ??= new AudioContext();
    if (contexto.state === "suspended") await contexto.resume();
    return contexto.state === "running";
  } catch {
    return false;
  }
}

/** "Plim-plom" de duas notas, alto o suficiente para uma cozinha. */
export function tocarAlerta(): void {
  if (!contexto || contexto.state !== "running") return;
  const agora = contexto.currentTime;
  for (const [i, frequencia] of [880, 1320, 880, 1320].entries()) {
    const oscilador = contexto.createOscillator();
    const volume = contexto.createGain();
    oscilador.type = "triangle";
    oscilador.frequency.value = frequencia;
    const inicio = agora + i * 0.22;
    volume.gain.setValueAtTime(0.0001, inicio);
    volume.gain.exponentialRampToValueAtTime(0.6, inicio + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.2);
    oscilador.connect(volume).connect(contexto.destination);
    oscilador.start(inicio);
    oscilador.stop(inicio + 0.21);
  }
}
