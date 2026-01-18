# roguelike

Tiny dungeon crawler with loot, swords, and multiple levels.

## Usage

- `roguelike`
- `roguelike easy` / `roguelike normal` / `roguelike hard`
- `roguelike -d hard`

## Goal

- Explore the dungeon, fight monsters, and descend the stairs (`>`).
- Find and equip sword upgrades (`!`) to increase your attack.
- Make it to the final depth and escape.

## Dungeons

- Each level is procedurally generated (random rooms/corridors and random placements), so every run is different.

## Controls

- Arrow keys: move / attack
- `h`: drink a healing potion
- `>`: descend (only works while standing on the stairs)
- `r`: restart
- `Esc` / `q`: quit

## Legend

- `@` you
- `g`/`o`/`b` enemies
- `!` weapon upgrade
- `+` healing potion
- `$` gold
- `&` shop (merchant)
- `>` stairs

## Tips

- Grab a sword early—your starting attack is weak.
- Potions don’t heal above max HP.
- Spend gold at the merchant (`&`) to buy potions and upgrades.
- If you’re low, retreat through corridors to fight one enemy at a time.
- If the screen gets messy, run `cls`.

## Gold

- Gold is used to buy things from the merchant (`&`).
- Stand on the merchant tile and press `b` to see prices, then press:
	- `1` to buy a potion
	- `2` to buy +1 max HP
	- `3` to buy +1 attack (sharpen)

## Difficulty

- Difficulty affects enemy stats/counts, gold drops, shop prices, and your starting HP.
- Set it when launching the game (it is saved for next time): `roguelike hard`.

## See also

- `cls`