/**
 * Player nationalities: 30 football nations, each with its own culturally
 * authentic first/last name pool, a flag and a tiny stat lean. The five
 * playable countries (ENG/ESP/ITA/GER/FRA) reuse their NAME_POOLS names.
 */
import type { CountryCode } from '../types/world';
import type { NationCode, StatKey } from '../types/player';
import { NAME_POOLS } from './namePools';

export interface Nationality {
  code: NationCode;
  name: string;
  flag: string;
  firstNames: string[];
  lastNames: string[];
  /** small stat nudge, never a potential buff */
  statLean: Partial<Record<StatKey, number>>;
}

const N = (code: NationCode, name: string, flag: string, firstNames: string[], lastNames: string[], statLean: Partial<Record<StatKey, number>> = {}): Nationality => ({
  code, name, flag, firstNames, lastNames, statLean,
});

export const NATIONALITIES: Record<NationCode, Nationality> = {
  ENG: N('ENG', 'England', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', NAME_POOLS.ENG.firstNames, NAME_POOLS.ENG.lastNames, { physical: 2, pace: 2 }),
  ESP: N('ESP', 'Spain', '🇪🇸', NAME_POOLS.ESP.firstNames, NAME_POOLS.ESP.lastNames, { passing: 2, dribbling: 2 }),
  ITA: N('ITA', 'Italy', '🇮🇹', NAME_POOLS.ITA.firstNames, NAME_POOLS.ITA.lastNames, { defending: 2, reflexes: 2, positioning: 2, handling: 1 }),
  GER: N('GER', 'Germany', '🇩🇪', NAME_POOLS.GER.firstNames, NAME_POOLS.GER.lastNames, { physical: 3 }),
  FRA: N('FRA', 'France', '🇫🇷', NAME_POOLS.FRA.firstNames, NAME_POOLS.FRA.lastNames, { pace: 2, dribbling: 2 }),
  BRA: N('BRA', 'Brazil', '🇧🇷',
    ['João', 'Rodrigo', 'Thiago', 'Gabriel', 'Lucas', 'Felipe', 'Rafael', 'Bruno', 'Leandro', 'Marcelo', 'Ronaldo', 'Juninho', 'Edmílson', 'Cláudio', 'Wellington', 'Anderson', 'Fábio', 'Vinícius', 'Matheus', 'Diego', 'Renato', 'Cafu', 'Denílson', 'Edson', 'Washington', 'Rivaldo', 'Márcio', 'Júlio'],
    ['Silva', 'Santos', 'Oliveira', 'Souza', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Lima', 'Araújo', 'Ferreira', 'Carvalho', 'Gomes', 'Ribeiro', 'Barbosa', 'Rocha', 'Moura', 'Cardoso', 'Teixeira', 'Batista', 'Freitas', 'Monteiro', 'Mendes', 'Cavalcanti', 'Assunção'],
    { dribbling: 3, physical: -1 }),
  ARG: N('ARG', 'Argentina', '🇦🇷',
    ['Martín', 'Gonzalo', 'Facundo', 'Matías', 'Nicolás', 'Juan Pablo', 'Agustín', 'Hernán', 'Sebastián', 'Ezequiel', 'Mauro', 'Gabriel', 'Ariel', 'Claudio', 'Diego', 'Leandro', 'Lautaro', 'Esteban', 'Fernando', 'Pablo', 'Walter', 'Maximiliano', 'Cristian', 'Germán'],
    ['González', 'Rodríguez', 'Gómez', 'Fernández', 'López', 'Díaz', 'Martínez', 'Pérez', 'Romero', 'Sosa', 'Álvarez', 'Ruiz', 'Benítez', 'Acosta', 'Medina', 'Herrera', 'Aguirre', 'Giménez', 'Paredes', 'Ortiz', 'Battaglia', 'Simeone', 'Zanetti', 'Ayala', 'Riquelme', 'Pizarro'],
    { dribbling: 2, shooting: 1 }),
  POR: N('POR', 'Portugal', '🇵🇹',
    ['João', 'Rui', 'Nuno', 'Luís', 'Tiago', 'Pedro', 'Ricardo', 'Bruno', 'Hélder', 'Sérgio', 'Paulo', 'Fernando', 'Hugo', 'Miguel', 'André', 'Diogo', 'Gonçalo', 'Vítor', 'Abel', 'Jorge', 'Simão', 'Rafael'],
    ['Silva', 'Santos', 'Ferreira', 'Pereira', 'Oliveira', 'Costa', 'Rodrigues', 'Martins', 'Sousa', 'Fernandes', 'Gonçalves', 'Gomes', 'Lopes', 'Marques', 'Alves', 'Almeida', 'Ribeiro', 'Pinto', 'Carvalho', 'Teixeira', 'Moreira', 'Correia', 'Figueiredo', 'Nogueira'],
    { dribbling: 2, passing: 1 }),
  NED: N('NED', 'Netherlands', '🇳🇱',
    ['Dennis', 'Patrick', 'Edgar', 'Frank', 'Ronald', 'Marc', 'Jaap', 'Bert', 'Wim', 'Ruud', 'Clarence', 'Arjen', 'Wesley', 'Rafael', 'Giovanni', 'Pierre', 'Jasper', 'Daan', 'Sem', 'Bram', 'Thijs', 'Joris', 'Arnold', 'Michel'],
    ['de Jong', 'Jansen', 'de Vries', 'van den Berg', 'van Dijk', 'Bakker', 'Visser', 'Smit', 'Meijer', 'de Boer', 'Mulder', 'de Groot', 'Bos', 'Vos', 'Peters', 'Hendriks', 'van Leeuwen', 'Dekker', 'Brouwer', 'de Wit', 'Dijkstra', 'Kluivert', 'Overmars', 'Koeman', 'van Basten', 'Stam'],
    { passing: 2, dribbling: 1 }),
  BEL: N('BEL', 'Belgium', '🇧🇪',
    ['Jan', 'Pieter', 'Wouter', 'Kevin', 'Thomas', 'Dries', 'Yannick', 'Axel', 'Toby', 'Jelle', 'Luc', 'Marc', 'Enzo', 'Philippe', 'Vincent', 'Eden', 'Thibaut', 'Romelu', 'Jérémy', 'Michy', 'Gert', 'Bart'],
    ['Peeters', 'Janssens', 'Maes', 'Jacobs', 'Mertens', 'Willems', 'Claes', 'Goossens', 'Wouters', 'De Smet', 'Dubois', 'Lambert', 'Dupont', 'Vermeulen', 'Van Damme', 'Hermans', 'Vandenberghe', 'De Bruyne', 'Vertonghen', 'Scifo', 'Wilmots', 'Ceulemans'],
    { passing: 1, physical: 1 }),
  CRO: N('CRO', 'Croatia', '🇭🇷',
    ['Luka', 'Ivan', 'Mario', 'Davor', 'Zvonimir', 'Robert', 'Dario', 'Marko', 'Josip', 'Ante', 'Igor', 'Slaven', 'Niko', 'Vedran', 'Mateo', 'Domagoj', 'Dejan', 'Tomislav', 'Andrej', 'Šime'],
    ['Horvat', 'Kovačević', 'Babić', 'Marić', 'Jurić', 'Novak', 'Knežević', 'Vuković', 'Perišić', 'Modrić', 'Šuker', 'Boban', 'Prosinečki', 'Bilić', 'Stimac', 'Jarni', 'Pavlović', 'Brozović', 'Kramarić', 'Rakitić', 'Petković', 'Lovren'],
    { passing: 2 }),
  URU: N('URU', 'Uruguay', '🇺🇾',
    ['Luis', 'Diego', 'Edinson', 'Álvaro', 'Fernando', 'Gastón', 'Martín', 'Sebastián', 'Nicolás', 'Matías', 'Rodrigo', 'Paolo', 'Enzo', 'Óscar', 'Walter', 'Darío', 'Fabián', 'Federico'],
    ['Suárez', 'Cavani', 'Forlán', 'Godín', 'Pereira', 'Rodríguez', 'Fernández', 'González', 'Martínez', 'Recoba', 'Francescoli', 'Lugano', 'Muslera', 'Abreu', 'Cáceres', 'Lodeiro', 'Ramírez', 'Silva', 'Valverde', 'Bentancur'],
    { physical: 1, defending: 1 }),
  COL: N('COL', 'Colombia', '🇨🇴',
    ['Carlos', 'Faustino', 'Freddy', 'René', 'Iván', 'Juan Guillermo', 'Radamel', 'James', 'Andrés', 'Jhon', 'Wílmar', 'Yerry', 'Davinson', 'Duván', 'Luis Fernando', 'Óscar', 'Mauricio', 'Jorge'],
    ['Valderrama', 'Asprilla', 'Rincón', 'Higuita', 'Córdoba', 'Cuadrado', 'Falcao', 'Rodríguez', 'Muriel', 'Mina', 'Sánchez', 'Zapata', 'Arias', 'Ospina', 'Perea', 'Restrepo', 'Valencia', 'Aristizábal'],
    { dribbling: 2, pace: 1 }),
  JPN: N('JPN', 'Japan', '🇯🇵',
    ['Hidetoshi', 'Shinji', 'Keisuke', 'Yuto', 'Kazuyoshi', 'Shunsuke', 'Takumi', 'Daichi', 'Wataru', 'Hiroshi', 'Makoto', 'Yasuhito', 'Junichi', 'Takashi', 'Kenta', 'Ritsu', 'Kaoru', 'Takefusa'],
    ['Nakata', 'Kagawa', 'Honda', 'Nagatomo', 'Miura', 'Nakamura', 'Minamino', 'Kamada', 'Endo', 'Yoshida', 'Hasebe', 'Endō', 'Inamoto', 'Takahara', 'Okazaki', 'Doan', 'Mitoma', 'Kubo', 'Tanaka', 'Suzuki'],
    { pace: 1, passing: 1, physical: -1 }),
  KOR: N('KOR', 'South Korea', '🇰🇷',
    ['Ji-sung', 'Heung-min', 'Min-jae', 'Chung-yong', 'Sung-yueng', 'Bum-kun', 'Young-pyo', 'Jae-sung', 'Hong-myung', 'Ui-jo', 'Kang-in', 'Hee-chan', 'Woo-young', 'Seung-ho', 'Dong-gook', 'Jung-hwan'],
    ['Park', 'Son', 'Kim', 'Lee', 'Ki', 'Cha', 'Hwang', 'Hong', 'Jung', 'Choi', 'Ahn', 'Seol', 'Koo', 'Jang', 'Yoon', 'Cho'],
    { pace: 1, physical: 1 }),
  NGA: N('NGA', 'Nigeria', '🇳🇬',
    ['Jay-Jay', 'Nwankwo', 'Sunday', 'Emmanuel', 'Daniel', 'Victor', 'Obafemi', 'John', 'Taribo', 'Celestine', 'Finidi', 'Rashidi', 'Kelechi', 'Wilfred', 'Ahmed', 'Samson', 'Uche', 'Chidi', 'Joseph', 'Peter'],
    ['Okocha', 'Kanu', 'Oliseh', 'Amuneke', 'Amokachi', 'Ikpeba', 'Martins', 'Obi', 'West', 'Babayaro', 'George', 'Yekini', 'Iheanacho', 'Ndidi', 'Musa', 'Onuachu', 'Osimhen', 'Ekong', 'Okonkwo', 'Eze'],
    { pace: 2, physical: 2 }),
  MAR: N('MAR', 'Morocco', '🇲🇦',
    ['Mustapha', 'Noureddine', 'Youssef', 'Achraf', 'Hakim', 'Sofyan', 'Romain', 'Nayef', 'Salaheddine', 'Mehdi', 'Abdelilah', 'Azzedine', 'Hicham', 'Bilal', 'Karim', 'Younès', 'Walid', 'Amine'],
    ['Hadji', 'Naybet', 'En-Nesyri', 'Hakimi', 'Ziyech', 'Amrabat', 'Saïss', 'Aguerd', 'Bassir', 'Chamakh', 'Benatia', 'Bounou', 'El Khalej', 'Bahja', 'Boufal', 'Belhanda', 'Mazraoui', 'Ounahi'],
    { dribbling: 2 }),
  SEN: N('SEN', 'Senegal', '🇸🇳',
    ['El Hadji', 'Sadio', 'Kalidou', 'Idrissa', 'Papiss', 'Moussa', 'Khalilou', 'Aliou', 'Ismaïla', 'Cheikhou', 'Salif', 'Lamine', 'Mbaye', 'Pape', 'Ferdinand', 'Henri', 'Boubacar', 'Habib'],
    ['Diouf', 'Mané', 'Koulibaly', 'Gueye', 'Cissé', 'Sow', 'Fadiga', 'Sarr', 'Kouyaté', 'Diao', 'Niang', 'Ndiaye', 'Diatta', 'Camara', 'Diop', 'Mendy', 'Sané', 'Faye', 'Seck', 'Touré'],
    { pace: 2, physical: 2 }),
  USA: N('USA', 'United States', '🇺🇸',
    ['Landon', 'Clint', 'Brian', 'Tim', 'Eric', 'Claudio', 'DaMarcus', 'Michael', 'Tab', 'Cobi', 'Alexi', 'Brad', 'Kasey', 'Christian', 'Weston', 'Tyler', 'Josh', 'Jordan', 'Kyle', 'Brandon'],
    ['Donovan', 'Dempsey', 'McBride', 'Howard', 'Wynalda', 'Reyna', 'Beasley', 'Bradley', 'Ramos', 'Jones', 'Lalas', 'Friedel', 'Keller', 'Pulisic', 'McKennie', 'Adams', 'Sargent', 'Morris', 'Robinson', 'Wood'],
    { physical: 1, pace: 1 }),
  MEX: N('MEX', 'Mexico', '🇲🇽',
    ['Hugo', 'Jorge', 'Cuauhtémoc', 'Rafael', 'Javier', 'Andrés', 'Hirving', 'Carlos', 'Guillermo', 'Raúl', 'Héctor', 'Jesús', 'Luis', 'Alberto', 'Claudio', 'Ramón', 'Pável', 'Gerardo'],
    ['Sánchez', 'Campos', 'Blanco', 'Márquez', 'Hernández', 'Guardado', 'Lozano', 'Vela', 'Ochoa', 'Jiménez', 'Herrera', 'Corona', 'Moreno', 'Suárez', 'Borgetti', 'Pardo', 'Salcido', 'Torrado'],
    { dribbling: 1, pace: 1 }),
  SWE: N('SWE', 'Sweden', '🇸🇪',
    ['Henrik', 'Tomas', 'Martin', 'Patrik', 'Kennet', 'Fredrik', 'Olof', 'Anders', 'Johan', 'Zlatan', 'Kim', 'Andreas', 'Pontus', 'Emil', 'Viktor', 'Sebastian', 'Mikael', 'Niclas'],
    ['Larsson', 'Brolin', 'Dahlin', 'Andersson', 'Ravelli', 'Ljungberg', 'Mellberg', 'Källström', 'Svensson', 'Johansson', 'Nilsson', 'Karlsson', 'Lindelöf', 'Forsberg', 'Isak', 'Kulusevski', 'Elmander', 'Thern'],
    { physical: 2 }),
  DEN: N('DEN', 'Denmark', '🇩🇰',
    ['Michael', 'Brian', 'Peter', 'Kasper', 'Christian', 'Simon', 'Thomas', 'Jon Dahl', 'Morten', 'Martin', 'Daniel', 'Pierre-Emile', 'Yussuf', 'Rasmus', 'Jesper', 'Nicklas', 'Mads', 'Kim'],
    ['Laudrup', 'Schmeichel', 'Eriksen', 'Kjær', 'Poulsen', 'Tomasson', 'Rommedahl', 'Gravesen', 'Jørgensen', 'Hansen', 'Nielsen', 'Pedersen', 'Andersen', 'Christensen', 'Larsen', 'Højbjerg', 'Bendtner', 'Olsen'],
    { passing: 1, physical: 1 }),
  POL: N('POL', 'Poland', '🇵🇱',
    ['Robert', 'Jakub', 'Łukasz', 'Kamil', 'Grzegorz', 'Piotr', 'Jerzy', 'Wojciech', 'Tomasz', 'Krzysztof', 'Zbigniew', 'Arkadiusz', 'Michał', 'Bartosz', 'Mateusz', 'Artur', 'Jacek', 'Marcin'],
    ['Lewandowski', 'Błaszczykowski', 'Piszczek', 'Glik', 'Krychowiak', 'Szczęsny', 'Dudek', 'Boniek', 'Lato', 'Milik', 'Zieliński', 'Kowalski', 'Nowak', 'Wiśniewski', 'Wójcik', 'Kamiński', 'Zając', 'Szymański'],
    { physical: 1, shooting: 1 }),
  SCO: N('SCO', 'Scotland', '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    ['Ally', 'Gordon', 'Hamish', 'Duncan', 'Andy', 'Scott', 'Kenny', 'Alan', 'Callum', 'Darren', 'Graeme', 'Kris', 'Stuart', 'Craig', 'Fraser', 'Ewan', 'Murray', 'Archie'],
    ['McAllister', 'McCoist', 'Strachan', 'Dalglish', 'McLeish', 'Ferguson', 'Robertson', 'McTominay', 'McGinn', 'Fletcher', 'Hendry', 'McStay', 'Durie', 'Boyd', 'Hartley', 'Gallacher', 'Collins', 'Leighton', 'McKinlay', 'Sinclair'],
    { physical: 2 }),
  SRB: N('SRB', 'Serbia', '🇷🇸',
    ['Dejan', 'Nemanja', 'Siniša', 'Dragan', 'Predrag', 'Savo', 'Branislav', 'Aleksandar', 'Dušan', 'Sergej', 'Nikola', 'Mateja', 'Filip', 'Luka', 'Milan', 'Vladimir', 'Zoran', 'Ivica'],
    ['Stanković', 'Vidić', 'Mihajlović', 'Stojković', 'Mijatović', 'Milošević', 'Ivanović', 'Kolarov', 'Tadić', 'Vlahović', 'Milinković-Savić', 'Mitrović', 'Kostić', 'Jovanović', 'Petrović', 'Nikolić', 'Đorđević', 'Savić'],
    { physical: 1, passing: 1 }),
  CIV: N('CIV', "Côte d'Ivoire", '🇨🇮',
    ['Didier', 'Yaya', 'Kolo', 'Salomon', 'Gervinho', 'Emmanuel', 'Wilfried', 'Serge', 'Cheick', 'Franck', 'Arouna', 'Aruna', 'Jean-Michaël', 'Max-Alain', 'Seydou', 'Siaka', 'Bakari', 'Ibrahim'],
    ['Drogba', 'Touré', 'Kalou', 'Eboué', 'Zokora', 'Bony', 'Aurier', 'Kessié', 'Tioté', 'Koné', 'Doumbia', 'Gradel', 'Bamba', 'Gbamin', 'Cissé', 'Zaha', 'Pépé', 'Sangaré'],
    { pace: 2, physical: 2 }),
  IRL: N('IRL', 'Ireland', '🇮🇪',
    ['Roy', 'Niall', 'Robbie', 'Damien', 'Shay', 'Packie', 'Denis', 'Kevin', 'Seamus', 'Aiden', 'Liam', 'Ciarán', 'Conor', 'Séamus', 'Darragh', 'Eoin', 'Cathal', 'Brendan'],
    ['Keane', 'Quinn', 'Duff', 'Given', 'Bonner', 'Irwin', 'Kilbane', 'Coleman', 'McGrath', 'Houghton', 'Aldridge', 'Cascarino', 'Townsend', 'Staunton', "O'Shea", 'Doherty', 'Murphy', 'Kelly', 'Byrne', 'Walsh'],
    { physical: 2 }),
  CMR: N('CMR', 'Cameroon', '🇨🇲',
    ['Samuel', 'Roger', 'Rigobert', 'Patrick', 'Geremi', 'Marc-Vivien', 'Alex', 'Stéphane', 'Thomas', 'Joël', 'André', 'Vincent', 'Benjamin', 'Eric', 'Pierre', 'Jean'],
    ["Eto'o", 'Milla', 'Song', 'Mboma', 'Njitap', 'Foé', 'Mbia', 'Kameni', 'Nkoulou', 'Matip', 'Onana', 'Aboubakar', 'Choupo-Moting', 'Webó', 'Djemba-Djemba', 'Nkufo'],
    { physical: 3 }),
  GHA: N('GHA', 'Ghana', '🇬🇭',
    ['Abedi', 'Tony', 'Michael', 'Kevin-Prince', 'Asamoah', 'André', 'Jordan', 'Sulley', 'Samuel', 'Stephen', 'Kwadwo', 'Thomas', 'Emmanuel', 'Mohammed', 'Kwame', 'Daniel'],
    ['Pelé', 'Yeboah', 'Essien', 'Boateng', 'Gyan', 'Ayew', 'Muntari', 'Kuffour', 'Appiah', 'Asamoah', 'Partey', 'Mensah', 'Agyemang', 'Addo', 'Owusu', 'Tetteh'],
    { pace: 1, physical: 2 }),
  AUT: N('AUT', 'Austria', '🇦🇹',
    ['Toni', 'Andreas', 'Herbert', 'Marko', 'David', 'Marcel', 'Christoph', 'Martin', 'Florian', 'Konrad', 'Stefan', 'Valentino', 'Ivica', 'Peter', 'Dietmar', 'Ernst'],
    ['Polster', 'Herzog', 'Prohaska', 'Arnautović', 'Alaba', 'Sabitzer', 'Baumgartner', 'Hinteregger', 'Laimer', 'Dragović', 'Janko', 'Schöttel', 'Pfeffer', 'Huber', 'Gruber', 'Wagner'],
    { physical: 1, passing: 1 }),
};

export const NATION_CODES = Object.keys(NATIONALITIES) as NationCode[];

/** Big football nations — the bulk of foreign imports. */
const MAJOR_FOREIGN: NationCode[] = ['ENG', 'ESP', 'ITA', 'GER', 'FRA', 'BRA', 'ARG', 'POR', 'NED', 'BEL', 'CRO', 'URU', 'COL'];
/** Smaller global spread. */
const GLOBAL_FOREIGN: NationCode[] = ['JPN', 'KOR', 'NGA', 'MAR', 'SEN', 'USA', 'MEX', 'SWE', 'DEN', 'POL', 'SCO', 'SRB', 'CIV', 'IRL', 'CMR', 'GHA', 'AUT'];
const MAJOR_W: Partial<Record<NationCode, number>> = { BRA: 1.5, ARG: 1.3, FRA: 1.2, NED: 1.1, POR: 1.0 };

/** Neighbouring-market bias: each league leans slightly toward certain imports. */
const LEAGUE_TIES: Record<CountryCode, NationCode[]> = {
  ENG: ['SCO', 'IRL', 'NED', 'SWE', 'DEN', 'NGA', 'GHA'],
  ESP: ['ARG', 'URU', 'COL', 'POR', 'MEX', 'MAR'],
  ITA: ['ARG', 'BRA', 'URU', 'CRO', 'SRB'],
  GER: ['AUT', 'POL', 'CRO', 'SRB', 'DEN', 'KOR', 'JPN'],
  FRA: ['SEN', 'CIV', 'MAR', 'CMR', 'BEL', 'POR'],
};

export interface NationRng {
  next(): number;
  chance(p: number): boolean;
  weighted<T>(items: readonly T[], weights: readonly number[]): T;
}

/** Roll a foreign nationality for a club in `country` (never the home nation). */
export function rollForeignNation(rng: NationRng, country: CountryCode): NationCode {
  const ties = LEAGUE_TIES[country];
  if (rng.chance(0.8)) {
    const items = MAJOR_FOREIGN.filter((c) => c !== country);
    const weights = items.map((c) => (MAJOR_W[c] ?? 0.8) * (ties.includes(c) ? 1.6 : 1));
    return rng.weighted(items, weights);
  }
  const weights = GLOBAL_FOREIGN.map((c) => (ties.includes(c) ? 2.2 : 1));
  return rng.weighted(GLOBAL_FOREIGN, weights);
}

/**
 * Nationality for a new player. Senior squads are ~55–65% domestic (top
 * flight slightly more cosmopolitan); youth intakes ~70% domestic.
 */
export function rollNationality(rng: NationRng, country: CountryCode, kind: 'SENIOR_T1' | 'SENIOR' | 'YOUTH' | 'FREE_AGENT'): NationCode {
  const domestic = kind === 'YOUTH' ? 0.7 : kind === 'SENIOR_T1' ? 0.56 : kind === 'FREE_AGENT' ? 0.6 : 0.64;
  return rng.chance(domestic) ? country : rollForeignNation(rng, country);
}

export function nationOf(code: NationCode | string): Nationality {
  return NATIONALITIES[code as NationCode] ?? NATIONALITIES.ENG;
}
