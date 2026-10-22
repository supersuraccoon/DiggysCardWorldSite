// 状态 id → 游戏里的状态图标文件名（public/images/status/）
const FILE = {
  shield: 'buff_shield', dodge: 'buff_dodge', lifesteal: 'buff_lifesteal', crit: 'buff_crit', thorns: 'buff_thorns',
  immune: 'buff_immune', revive: 'buff_revive', regen: 'buff_regen', atk: 'buff_atk', hp: 'buff_maxhp',
  reflect: 'buff_reflect', combo: 'buff_multihit', knockback: 'buff_knockback', range: 'buff_range',
  splash: 'buff_splash', bounce: 'buff_bounce',
  poison: 'debuff_poison', weak: 'debuff_weak', sunder: 'debuff_armorbreak', silence: 'debuff_silence',
  confuse: 'debuff_confuse', bleed: 'debuff_bleed', stun: 'debuff_stun',
};
export const statusIcon = (id, color = true) => (FILE[id] ? `/images/status/status_${FILE[id]}_${color ? 'color' : 'bw'}.png` : null);
export const STAT_ICONS = { heart: '/images/icons/heart.png', tooth: '/images/icons/tooth.png', armor: '/images/icons/armor.png', gold: '/images/icons/coin.png' };
export const STAT_LABELS = { heart: '心', tooth: '牙', armor: '甲', gold: '金' };
