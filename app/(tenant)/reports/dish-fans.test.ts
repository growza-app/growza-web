import { describe, expect, it } from 'vitest';
import { dishFansTemplate, fanDish } from './dish-fans';

describe('dish fans message', () => {
  it('names the dish without its size, and the restaurant', () => {
    expect(dishFansTemplate('Paneer Butter Masala (Half)', 'Spice Garden')).toBe(
      'Craving Paneer Butter Masala? Your favourite is waiting at Spice Garden. Come in or order this week 🍽️',
    );
  });
  it('drops an add-on on the line before the size: "Craving Masala Dosa + Extra cheese?" is not a sentence', () => {
    expect(fanDish('Masala Dosa + Extra cheese')).toBe('Masala Dosa');
    expect(dishFansTemplate('Paneer Butter Masala (Half) + Extra cheese', 'Spice Garden')).toBe(
      'Craving Paneer Butter Masala? Your favourite is waiting at Spice Garden. Come in or order this week 🍽️',
    );
  });
  it('no business name: "us"', () => {
    expect(dishFansTemplate('Masala Dosa', '  ')).toBe('Craving Masala Dosa? Your favourite is waiting at us. Come in or order this week 🍽️');
  });
  it('a name that is only a bracket keeps it', () => {
    expect(fanDish('(Special)')).toBe('(Special)');
  });
});
