export const mockUser = {
  firstName: 'Aarav',
  lastName: 'Mehta',
  businessName: 'Mehta Traders & Co.',
  businessCategory: 'Retail & Distribution',
  location: 'Pune, Maharashtra',
  selectedBundleCount: 2,
  avatarInitials: 'AM',
};

export function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
