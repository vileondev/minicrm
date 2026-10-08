import arrowsInSimple from '@phosphor-icons/core/assets/regular/arrows-in-simple.svg';
import arrowsLeftRight from '@phosphor-icons/core/assets/regular/arrows-left-right.svg';
import arrowSquareOut from '@phosphor-icons/core/assets/regular/arrow-square-out.svg';
import calendarBlank from '@phosphor-icons/core/assets/regular/calendar-blank.svg';
import caretLeft from '@phosphor-icons/core/assets/regular/caret-left.svg';
import caretRight from '@phosphor-icons/core/assets/regular/caret-right.svg';
import chatCircleText from '@phosphor-icons/core/assets/regular/chat-circle-text.svg';
import chartBar from '@phosphor-icons/core/assets/regular/chart-bar.svg';
import checkCircle from '@phosphor-icons/core/assets/regular/check-circle.svg';
import coins from '@phosphor-icons/core/assets/regular/coins.svg';
import cornersOut from '@phosphor-icons/core/assets/regular/corners-out.svg';
import downloadSimple from '@phosphor-icons/core/assets/regular/download-simple.svg';
import eye from '@phosphor-icons/core/assets/regular/eye.svg';
import eyeSlash from '@phosphor-icons/core/assets/regular/eye-slash.svg';
import gearSix from '@phosphor-icons/core/assets/regular/gear-six.svg';
import kanban from '@phosphor-icons/core/assets/regular/kanban.svg';
import listChecks from '@phosphor-icons/core/assets/regular/list-checks.svg';
import magnifyingGlass from '@phosphor-icons/core/assets/regular/magnifying-glass.svg';
import paperPlaneTilt from '@phosphor-icons/core/assets/regular/paper-plane-tilt.svg';
import phone from '@phosphor-icons/core/assets/regular/phone.svg';
import plus from '@phosphor-icons/core/assets/regular/plus.svg';
import sidebarSimple from '@phosphor-icons/core/assets/regular/sidebar-simple.svg';
import sparkle from '@phosphor-icons/core/assets/regular/sparkle.svg';
import trash from '@phosphor-icons/core/assets/regular/trash.svg';
import usersThree from '@phosphor-icons/core/assets/regular/users-three.svg';
import warning from '@phosphor-icons/core/assets/regular/warning.svg';
import x from '@phosphor-icons/core/assets/regular/x.svg';

/** Ícones Phosphor (regular). Nada de emoji nem SVG desenhado à mão. */
const ICONS = {
  'arrows-in': arrowsInSimple,
  'arrows-lr': arrowsLeftRight,
  'open-out': arrowSquareOut,
  calendar: calendarBlank,
  'caret-left': caretLeft,
  'caret-right': caretRight,
  chart: chartBar,
  chat: chatCircleText,
  check: checkCircle,
  coins,
  fullscreen: cornersOut,
  download: downloadSimple,
  eye,
  'eye-off': eyeSlash,
  gear: gearSix,
  kanban,
  tasks: listChecks,
  search: magnifyingGlass,
  send: paperPlaneTilt,
  phone,
  plus,
  panel: sidebarSimple,
  sparkle,
  trash,
  users: usersThree,
  warning,
  x,
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, size = 16): SVGElement {
  const svg = new DOMParser().parseFromString(ICONS[name], 'image/svg+xml').documentElement;
  svg.setAttribute('class', 'ic');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  return document.importNode(svg, true) as unknown as SVGElement;
}
