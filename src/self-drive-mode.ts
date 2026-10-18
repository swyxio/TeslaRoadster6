import './self-drive-mode.css';
import type { DriveMode } from '../shared/drive-mode';

const modes: { value: DriveMode; label: string; description: string }[] = [
  { value: 'road', label: 'Street Pilot', description: 'Follows streets and tries to recover from blockages.' },
  { value: 'jump', label: 'Ludicrous Leap', description: 'Tries to hop past obstacles using rocket air.' },
  { value: 'sky', label: 'Maximum Plaid', description: 'Tries rocket flight and nearby currents when useful.' },
];

/** A single choice controls the next map or delivery trip, wherever it is changed. */
export function createDriveModes(containers: HTMLElement[], onUnavailable: (reason: string) => void, onInteract: () => void, openShop: () => void) {
  let selected: DriveMode = 'road', available = { rocket: false, jump: false, sky: false };
  const enabled = (mode: DriveMode) => mode === 'road' || (available.rocket && available.jump && (mode === 'jump' || available.sky));
  const controls = containers.map((container, index) => {
    container.classList.add('drive-mode');
    const label = document.createElement('label');
    label.textContent = 'SELF-DRIVE MODE';
    const select = document.createElement('select');
    select.id = `drive-mode-${index}`;
    select.setAttribute('aria-describedby', `drive-mode-help-${index}`);
    label.htmlFor = select.id;
    for (const mode of modes) {
      const option = document.createElement('option');
      option.value = mode.value; option.textContent = mode.label;
      select.append(option);
    }
    const help = document.createElement('span');
    help.id = `drive-mode-help-${index}`;
    help.className = 'drive-mode-help';
    const shop = document.createElement('button');
    shop.type = 'button'; shop.className = 'drive-mode-shop'; shop.textContent = 'SpaceX shop ↗';
    shop.addEventListener('click', openShop);
    container.append(label, select, shop, help);
    select.addEventListener('focus', onInteract);
    select.addEventListener('change', () => {
      const choice = modes.find(mode => mode.value === select.value);
      if (choice && enabled(choice.value)) selected = choice.value;
      render();
    });
    return { select, help, shop };
  });
  function render() {
    const choice = modes.find(mode => mode.value === selected)!;
    const explanation = !available.jump
      ? 'Buy Ludicrous Leap and Maximum Plaid at SpaceX. Both also need a rocket-equipped car.'
      : !available.rocket
        ? available.sky ? 'Both upgrades are installed. Equip a rocket kit or collect a rocket pickup.' : 'Ludicrous Leap is installed; equip a rocket to use it. Maximum Plaid is available at SpaceX.'
        : !available.sky ? `${choice.description} Maximum Plaid is available at SpaceX.` : `${choice.description} Applies to the next trip.`;
    for (const { select, help, shop } of controls) {
      select.value = selected;
      for (const option of select.options) option.disabled = !enabled(option.value as DriveMode);
      help.textContent = explanation;
      shop.hidden = available.rocket && available.jump && available.sky;
    }
  }
  render();
  return {
    mode: () => selected,
    label: (mode: DriveMode) => modes.find(item => item.value === mode)!.label,
    update(next: { rocket: boolean; jump: boolean; sky: boolean }) {
      if (available.rocket === next.rocket && available.jump === next.jump && available.sky === next.sky) return;
      available = next;
      const reset = !enabled(selected);
      const reason = !available.jump ? 'Buy Ludicrous Leap at a SpaceX shop for this car.' : selected === 'sky' && !available.sky ? 'Buy Maximum Plaid at a SpaceX shop for this car.' : 'Equip a rocket kit or collect a rocket pickup.';
      if (reset) selected = 'road';
      render();
      if (reset) onUnavailable(reason);
    },
  };
}
