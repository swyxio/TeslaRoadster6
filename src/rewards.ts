type Reward = { kind: 'pickup' | 'delivery' | 'pickup-research' | 'delivery-research' | 'supply-repair' | 'supply-air' | 'research'; amount: number };
let popup: HTMLElement | null = null;
let timeout = 0;
function getPopup(): HTMLElement {
  if (popup) return popup;
  popup = document.getElementById('reward')!;
  const confetti = popup.querySelector<HTMLElement>('.confetti')!;
  const colors = ['#ffd27f', '#ff7868', '#9ee6c2', '#f8f2d9', '#76c9d4'];
  for (let i = 0; i < 24; i++) {
    const piece = document.createElement('i');
    const angle = i * Math.PI * 2 / 24;
    const distance = 150 + (i % 4) * 45;
    piece.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
    piece.style.setProperty('--y', `${Math.sin(angle) * distance - 25}px`);
    piece.style.setProperty('--spin', `${(i % 2 ? 1 : -1) * (220 + i * 15)}deg`);
    piece.style.setProperty('--color', colors[i % colors.length]);
    confetti.append(piece);
  }
  return popup;
}
export function resetCelebration() {
  clearTimeout(timeout);
  if (!popup) return;
  popup.classList.remove('celebrate');
  popup.querySelector('#reward-label')!.textContent = '';
  popup.querySelector('#reward-amount')!.textContent = '';
}
export function celebrateReward(reward: Reward) {
  const element = getPopup();
  clearTimeout(timeout);
  element.classList.remove('celebrate');
  // Restart CSS animations even when two rewards arrive close together.
  void element.offsetWidth;
  element.querySelector('#reward-label')!.textContent = reward.kind === 'pickup' ? 'FAST PICKUP BONUS' : reward.kind === 'delivery' ? 'DELIVERY COMPLETE' : reward.kind === 'pickup-research' ? 'PICKUP + RESEARCH' : reward.kind === 'delivery-research' ? 'DELIVERY + RESEARCH' : reward.kind === 'supply-repair' ? 'REPAIR + CASH' : reward.kind === 'research' ? 'RESEARCH AWARD' : 'AIR REFILL + CASH';
  element.querySelector('#reward-amount')!.textContent = `+$${reward.amount}`;
  element.classList.add('celebrate');
  timeout = window.setTimeout(resetCelebration, 3000);
}
