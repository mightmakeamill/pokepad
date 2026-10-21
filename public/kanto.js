/* Kanto data + game rules. Shared by the browser and the server (UMD). */
(function (root) {
  // id|name|types|species|evolvesFrom
  const RAW = `1|Bulbasaur|grass/poison|Seed|
2|Ivysaur|grass/poison|Seed|1
3|Venusaur|grass/poison|Seed|2
4|Charmander|fire|Lizard|
5|Charmeleon|fire|Flame|4
6|Charizard|fire/flying|Flame|5
7|Squirtle|water|Tiny Turtle|
8|Wartortle|water|Turtle|7
9|Blastoise|water|Shellfish|8
10|Caterpie|bug|Worm|
11|Metapod|bug|Cocoon|10
12|Butterfree|bug/flying|Butterfly|11
13|Weedle|bug/poison|Hairy Bug|
14|Kakuna|bug/poison|Cocoon|13
15|Beedrill|bug/poison|Poison Bee|14
16|Pidgey|normal/flying|Tiny Bird|
17|Pidgeotto|normal/flying|Bird|16
18|Pidgeot|normal/flying|Bird|17
19|Rattata|normal|Mouse|
20|Raticate|normal|Mouse|19
21|Spearow|normal/flying|Tiny Bird|
22|Fearow|normal/flying|Beak|21
23|Ekans|poison|Snake|
24|Arbok|poison|Cobra|23
25|Pikachu|electric|Mouse|
26|Raichu|electric|Mouse|25
27|Sandshrew|ground|Mouse|
28|Sandslash|ground|Mouse|27
29|Nidoran♀|poison|Poison Pin|
30|Nidorina|poison|Poison Pin|29
31|Nidoqueen|poison/ground|Drill|30
32|Nidoran♂|poison|Poison Pin|
33|Nidorino|poison|Poison Pin|32
34|Nidoking|poison/ground|Drill|33
35|Clefairy|normal|Fairy|
36|Clefable|normal|Fairy|35
37|Vulpix|fire|Fox|
38|Ninetales|fire|Fox|37
39|Jigglypuff|normal|Balloon|
40|Wigglytuff|normal|Balloon|39
41|Zubat|poison/flying|Bat|
42|Golbat|poison/flying|Bat|41
43|Oddish|grass/poison|Weed|
44|Gloom|grass/poison|Weed|43
45|Vileplume|grass/poison|Flower|44
46|Paras|bug/grass|Mushroom|
47|Parasect|bug/grass|Mushroom|46
48|Venonat|bug/poison|Insect|
49|Venomoth|bug/poison|Poison Moth|48
50|Diglett|ground|Mole|
51|Dugtrio|ground|Mole|50
52|Meowth|normal|Scratch Cat|
53|Persian|normal|Classy Cat|52
54|Psyduck|water|Duck|
55|Golduck|water|Duck|54
56|Mankey|fighting|Pig Monkey|
57|Primeape|fighting|Pig Monkey|56
58|Growlithe|fire|Puppy|
59|Arcanine|fire|Legendary|58
60|Poliwag|water|Tadpole|
61|Poliwhirl|water|Tadpole|60
62|Poliwrath|water/fighting|Tadpole|61
63|Abra|psychic|Psi|
64|Kadabra|psychic|Psi|63
65|Alakazam|psychic|Psi|64
66|Machop|fighting|Superpower|
67|Machoke|fighting|Superpower|66
68|Machamp|fighting|Superpower|67
69|Bellsprout|grass/poison|Flower|
70|Weepinbell|grass/poison|Flycatcher|69
71|Victreebel|grass/poison|Flycatcher|70
72|Tentacool|water/poison|Jellyfish|
73|Tentacruel|water/poison|Jellyfish|72
74|Geodude|rock/ground|Rock|
75|Graveler|rock/ground|Rock|74
76|Golem|rock/ground|Megaton|75
77|Ponyta|fire|Fire Horse|
78|Rapidash|fire|Fire Horse|77
79|Slowpoke|water/psychic|Dopey|
80|Slowbro|water/psychic|Hermit Crab|79
81|Magnemite|electric|Magnet|
82|Magneton|electric|Magnet|81
83|Farfetch'd|normal/flying|Wild Duck|
84|Doduo|normal/flying|Twin Bird|
85|Dodrio|normal/flying|Triple Bird|84
86|Seel|water|Sea Lion|
87|Dewgong|water/ice|Sea Lion|86
88|Grimer|poison|Sludge|
89|Muk|poison|Sludge|88
90|Shellder|water|Bivalve|
91|Cloyster|water/ice|Bivalve|90
92|Gastly|ghost/poison|Gas|
93|Haunter|ghost/poison|Gas|92
94|Gengar|ghost/poison|Shadow|93
95|Onix|rock/ground|Rock Snake|
96|Drowzee|psychic|Hypnosis|
97|Hypno|psychic|Hypnosis|96
98|Krabby|water|River Crab|
99|Kingler|water|Pincer|98
100|Voltorb|electric|Ball|
101|Electrode|electric|Ball|100
102|Exeggcute|grass/psychic|Egg|
103|Exeggutor|grass/psychic|Coconut|102
104|Cubone|ground|Lonely|
105|Marowak|ground|Bone Keeper|104
106|Hitmonlee|fighting|Kicking|
107|Hitmonchan|fighting|Punching|
108|Lickitung|normal|Licking|
109|Koffing|poison|Poison Gas|
110|Weezing|poison|Poison Gas|109
111|Rhyhorn|ground/rock|Spikes|
112|Rhydon|ground/rock|Drill|111
113|Chansey|normal|Egg|
114|Tangela|grass|Vine|
115|Kangaskhan|normal|Parent|
116|Horsea|water|Dragon|
117|Seadra|water|Dragon|116
118|Goldeen|water|Goldfish|
119|Seaking|water|Goldfish|118
120|Staryu|water|Star Shape|
121|Starmie|water/psychic|Mysterious|120
122|Mr. Mime|psychic|Barrier|
123|Scyther|bug/flying|Mantis|
124|Jynx|ice/psychic|Human Shape|
125|Electabuzz|electric|Electric|
126|Magmar|fire|Spitfire|
127|Pinsir|bug|Stag Beetle|
128|Tauros|normal|Wild Bull|
129|Magikarp|water|Fish|
130|Gyarados|water/flying|Atrocious|129
131|Lapras|water/ice|Transport|
132|Ditto|normal|Transform|
133|Eevee|normal|Evolution|
134|Vaporeon|water|Bubble Jet|133
135|Jolteon|electric|Lightning|133
136|Flareon|fire|Flame|133
137|Porygon|normal|Virtual|
138|Omanyte|rock/water|Spiral|
139|Omastar|rock/water|Spiral|138
140|Kabuto|rock/water|Shellfish|
141|Kabutops|rock/water|Shellfish|140
142|Aerodactyl|rock/flying|Fossil|
143|Snorlax|normal|Sleeping|
144|Articuno|ice/flying|Freeze|
145|Zapdos|electric/flying|Electric|
146|Moltres|fire/flying|Flame|
147|Dratini|dragon|Dragon|
148|Dragonair|dragon|Dragon|147
149|Dragonite|dragon/flying|Dragon|148
150|Mewtwo|psychic|Genetic|
151|Mew|psychic|New Species|`;

  const POKEMON = RAW.split('\n').map((line) => {
    const [id, name, types, species, from] = line.split('|');
    return { id: +id, name, types: types.split('/'), species, from: from ? +from : null };
  });
  const byId = (id) => POKEMON[id - 1];

  // On-chain ticker: letters only, gendered Nidoran keep their sign as F/M.
  const ticker = (p) =>
    p.name.replace('♀', 'F').replace('♂', 'M').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);

  // Poké Balls = the dev's initial buy on the pump.fun bonding curve.
  const BALLS = [
    { key: 'poke', name: 'Poké Ball', sol: 0.1, blurb: 'A standard throw. 0.1 SOL first buy.' },
    { key: 'great', name: 'Great Ball', sol: 0.5, blurb: 'Better odds of holding on. 0.5 SOL first buy.' },
    { key: 'ultra', name: 'Ultra Ball', sol: 1.5, blurb: 'For serious trainers. 1.5 SOL first buy.' },
    { key: 'master', name: 'Master Ball', sol: 5, blurb: 'Never fails. 5 SOL first buy. One per trainer.', oncePerTrainer: true },
  ];

  // Story locks, taken from where each Pokémon shows up in Red & Blue.
  const SPECIAL = {
    138: { need: 30, why: 'Cinnabar Lab revives fossils once 30 Pokémon are on-chain.' },
    140: { need: 30, why: 'Cinnabar Lab revives fossils once 30 Pokémon are on-chain.' },
    142: { need: 30, why: 'Cinnabar Lab revives Old Amber once 30 Pokémon are on-chain.' },
    143: { needIds: [94], why: 'Snorlax is asleep on Route 12. Free Lavender Tower (catch Gengar) to get the Poké Flute.' },
    144: { need: 50, why: 'The Seafoam Islands open once 50 Pokémon are on-chain.' },
    145: { need: 50, why: 'The Power Plant opens once 50 Pokémon are on-chain.' },
    146: { need: 50, why: 'Victory Road opens once 50 Pokémon are on-chain.' },
    150: { need: 100, needIds: [144, 145, 146], why: 'Cerulean Cave opens after 100 catches and all three legendary birds.' },
    151: { need: 150, why: 'Mew appears only when the other 150 are on-chain.' },
  };

  // Returns null when catchable, otherwise a reason string.
  function lockReason(id, caught) {
    const p = byId(id);
    if (!p) return 'No such Pokémon in the Kanto Pokédex.';
    if (caught[id]) return `${p.name} has already been caught.`;
    if (p.from && !caught[p.from]) return `${p.name} evolves from ${byId(p.from).name}. Catch ${byId(p.from).name} first.`;
    const s = SPECIAL[id];
    if (s) {
      const n = Object.keys(caught).length;
      if (s.need && n < s.need) return s.why;
      if (s.needIds && s.needIds.some((x) => !caught[x])) return s.why;
    }
    return null;
  }

  // The eight Kanto gym badges, earned by the types a trainer has caught.
  const BADGES = [
    { name: 'Boulder', leader: 'Brock', city: 'Pewter City', type: 'rock', count: 3 },
    { name: 'Cascade', leader: 'Misty', city: 'Cerulean City', type: 'water', count: 5 },
    { name: 'Thunder', leader: 'Lt. Surge', city: 'Vermilion City', type: 'electric', count: 3 },
    { name: 'Rainbow', leader: 'Erika', city: 'Celadon City', type: 'grass', count: 4 },
    { name: 'Soul', leader: 'Koga', city: 'Fuchsia City', type: 'poison', count: 5 },
    { name: 'Marsh', leader: 'Sabrina', city: 'Saffron City', type: 'psychic', count: 3 },
    { name: 'Volcano', leader: 'Blaine', city: 'Cinnabar Island', type: 'fire', count: 3 },
    { name: 'Earth', leader: 'Giovanni', city: 'Viridian City', type: 'ground', count: 4 },
  ];

  function badgesFor(trainer, caught) {
    const tally = {};
    for (const [id, c] of Object.entries(caught)) {
      if (c.trainer !== trainer) continue;
      for (const t of byId(+id).types) tally[t] = (tally[t] || 0) + 1;
    }
    return BADGES.map((b) => ({ ...b, have: tally[b.type] || 0, earned: (tally[b.type] || 0) >= b.count }));
  }

  const api = { POKEMON, byId, ticker, BALLS, SPECIAL, lockReason, BADGES, badgesFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KANTO = api;
})(typeof self !== 'undefined' ? self : this);
