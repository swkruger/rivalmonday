/** Initials for a name or, failing that, an email: up to two letters. */
function initials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  const value = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  return (value || label[0] || '?').toUpperCase();
}

/**
 * A user's circle: their photo, or initials on the secondary colour. Decorative (`alt=""`): the name always sits next
 * to it. `size` is the diameter in px.
 */
export function UserAvatar({ name, email, avatarUrl, size = 38 }: { name: string; email: string; avatarUrl: string | null; size?: number }) {
  const box = { width: size, height: size };
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt="" width={size} height={size} style={box} className="flex-shrink-0 rounded-full object-cover" />;
  }
  return (
    <span aria-hidden="true" style={{ ...box, fontSize: Math.round(size * 0.4) }} className="grid flex-shrink-0 place-items-center rounded-full bg-secondary font-bold text-white">
      {initials(name || email)}
    </span>
  );
}
