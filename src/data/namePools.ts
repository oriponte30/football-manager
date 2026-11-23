import type { CountryCode } from '../types/world';

export interface NamePool {
  firstNames: string[];
  lastNames: string[];
  townPrefixes: string[];
  townSuffixes: string[];
  /** standalone town names */
  towns: string[];
  /** club name templates; {T} = town */
  clubPatterns: string[];
  staffFirst: string[];
}

export const NAME_POOLS: Record<CountryCode, NamePool> = {
  ENG: {
    firstNames: ['Gary', 'Lee', 'Darren', 'Stuart', 'Wayne', 'Craig', 'Paul', 'Mark', 'Steve', 'Neil', 'Jamie', 'Dean', 'Robbie', 'Kevin', 'Ian', 'Tony', 'Danny', 'Martin', 'Graham', 'Lee', 'Carl', 'Ryan', 'Jason', 'Alan', 'Shaun', 'Terry', 'Colin', 'Matt', 'Chris', 'Ollie', 'Jack', 'Harry', 'Tom', 'Callum', 'Billy', 'Nicky', 'Les', 'Trevor', 'Phil', 'Rob'],
    lastNames: ['Ashworth', 'Barnes', 'Clough', 'Dawson', 'Ellison', 'Fletcher', 'Gannon', 'Hargreaves', 'Ingham', 'Jessop', 'Kettering', 'Lockwood', 'Marsden', 'Norris', 'Oakley', 'Pickering', 'Quinn', 'Ramsbottom', 'Shelton', 'Thornley', 'Underwood', 'Varley', 'Whitaker', 'Yardley', 'Briggs', 'Cartwright', 'Dobson', 'Fenwick', 'Gilchrist', 'Holloway', 'Kershaw', 'Lumley', 'Moxon', 'Pearce', 'Rowntree', 'Sutcliffe', 'Tindall', 'Wragg', 'Atherton', 'Butterfield', 'Crossley', 'Dunmore', 'Hebden', 'Ledger', 'Mottram', 'Royle', 'Stubbs', 'Tetley'],
    townPrefixes: ['Ash', 'Brad', 'Carr', 'Dun', 'Elm', 'Fen', 'Gran', 'Hal', 'Kings', 'Lang', 'Mar', 'Nor', 'Oak', 'Pen', 'Red', 'Stan', 'Thorn', 'Wey', 'Whit', 'Brook', 'Castle', 'Mill', 'Brent', 'Hollin', 'Kirk', 'Sel'],
    townSuffixes: ['bury', 'ford', 'ton', 'field', 'ley', 'wick', 'mouth', 'borough', 'ham', 'port', 'gate', 'dale', 'by', 'stead'],
    towns: ['Northgate', 'Ironbridge', 'Saltmarsh', 'Coldharbour', 'Fernhill', 'Blackmoor'],
    clubPatterns: ['{T} United', '{T} Town', '{T} City', '{T} Rovers', '{T} Athletic', '{T} Wanderers', '{T} Albion', '{T} County', '{T} Rangers', 'AFC {T}', '{T} Borough', '{T} Villa'],
    staffFirst: ['Ron', 'Brian', 'Dave', 'Harry', 'Jim', 'Frank', 'Bobby', 'Stan', 'Kenny', 'Howard'],
  },
  ESP: {
    firstNames: ['Javier', 'Sergio', 'Iván', 'Raúl', 'Fernando', 'Pablo', 'Álvaro', 'Diego', 'Carlos', 'Jorge', 'Miguel', 'Luis', 'Rubén', 'Adrián', 'Íker', 'Dani', 'Rafa', 'Marcos', 'Óscar', 'Unai', 'Aitor', 'Gorka', 'Joaquín', 'Santi', 'Nacho', 'Kiko', 'Toni', 'Pedro', 'Guillermo', 'Hugo', 'Mario', 'Alberto', 'Jaime', 'Borja', 'Andoni'],
    lastNames: ['García', 'Fernández', 'López', 'Martínez', 'Sánchez', 'Pérez', 'Gómez', 'Ruiz', 'Díaz', 'Moreno', 'Muñoz', 'Álvarez', 'Romero', 'Navarro', 'Torres', 'Domínguez', 'Vázquez', 'Ramos', 'Gil', 'Serrano', 'Blanco', 'Molina', 'Castro', 'Ortega', 'Delgado', 'Marín', 'Iglesias', 'Medina', 'Garrido', 'Cortés', 'Lozano', 'Cano', 'Prieto', 'Méndez', 'Calvo', 'Vidal', 'Herrera', 'Peña', 'Aguirre', 'Etxeberria', 'Zubizarreta', 'Larrañaga'],
    townPrefixes: ['Villa', 'San', 'Puerto', 'Santa', 'Monte', 'Torre', 'Valle', 'Alcal', 'Sierra', 'Campo', 'Castell', 'Aguas', 'Mira', 'Ber', 'Olm', 'Cal'],
    townSuffixes: ['nueva', 'real', 'mar', 'dorada', 'blanca', 'rubia', 'alta', 'vieja', 'ejo', 'ares', 'edo', 'era', 'ona'],
    towns: ['Montebravo', 'Riosalado', 'Peñaverde', 'Castroviejo', 'Lomaclara', 'Arenales'],
    clubPatterns: ['Real {T}', 'CD {T}', 'UD {T}', 'Atlético {T}', 'Deportivo {T}', 'SD {T}', 'Racing {T}', 'CF {T}', 'Club {T}', 'Unión {T}', 'Sporting {T}', 'Real Club {T}'],
    staffFirst: ['Vicente', 'Luis', 'Javier', 'Josep', 'Xabier', 'Manolo', 'Paco', 'Txetxu', 'Quique', 'Lorenzo'],
  },
  ITA: {
    firstNames: ['Marco', 'Alessandro', 'Davide', 'Luca', 'Andrea', 'Francesco', 'Giuseppe', 'Roberto', 'Paolo', 'Fabio', 'Simone', 'Stefano', 'Matteo', 'Gianluca', 'Christian', 'Daniele', 'Massimo', 'Filippo', 'Riccardo', 'Antonio', 'Giorgio', 'Lorenzo', 'Salvatore', 'Mattia', 'Federico', 'Enrico', 'Vincenzo', 'Dino', 'Gennaro', 'Pietro', 'Angelo', 'Ciro', 'Emiliano'],
    lastNames: ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca', 'Mancini', 'Costa', 'Giordano', 'Rizzo', 'Lombardi', 'Moretti', 'Barbieri', 'Fontana', 'Santoro', 'Mariani', 'Rinaldi', 'Caruso', 'Ferrara', 'Galli', 'Martini', 'Leone', 'Longo', 'Gentile', 'Vitale', 'Serra', 'Coppola', 'De Santis', 'Ferri', 'Pellegrini', 'Bellucci', 'Testa', 'Brambilla', 'Cattaneo'],
    townPrefixes: ['Castel', 'Monte', 'Porto', 'San', 'Villa', 'Borgo', 'Ponte', 'Rocca', 'Val', 'Fonte', 'Lago', 'Terra'],
    townSuffixes: ['franco', 'verde', 'rosso', 'nuovo', 'alto', 'mare', 'fiore', 'vecchio', 'bello', 'sereno', 'chiaro', 'antico'],
    towns: ['Valdorsa', 'Sassomoro', 'Ripalta', 'Ferrandina', 'Torrecupa', 'Pianella'],
    clubPatterns: ['AC {T}', 'US {T}', '{T} Calcio', 'SS {T}', 'AS {T}', 'FC {T}', 'Sporting {T}', 'Virtus {T}', 'Pro {T}', 'Unione {T}', 'Atletico {T}', 'Polisportiva {T}'],
    staffFirst: ['Arrigo', 'Giovanni', 'Fabio', 'Carlo', 'Nevio', 'Cesare', 'Gigi', 'Marcello', 'Dino', 'Ottavio'],
  },
  GER: {
    firstNames: ['Thomas', 'Michael', 'Stefan', 'Andreas', 'Jürgen', 'Matthias', 'Christian', 'Oliver', 'Markus', 'Sebastian', 'Jens', 'Torsten', 'Lars', 'Dirk', 'Uwe', 'Kai', 'Jan', 'Lukas', 'Tobias', 'Felix', 'Florian', 'Niklas', 'Björn', 'Holger', 'Sven', 'Rüdiger', 'Karsten', 'Marco', 'Dennis', 'Timo', 'Bastian', 'Mario', 'Max', 'Jonas'],
    lastNames: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Richter', 'Klein', 'Wolf', 'Schröder', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krüger', 'Hartmann', 'Lange', 'Werner', 'Krause', 'Lehmann', 'Köhler', 'Maier', 'Herrmann', 'König', 'Walter', 'Kaiser', 'Fuchs', 'Peters', 'Möller', 'Weiß', 'Jung', 'Hahn', 'Vogel', 'Friedrich', 'Keller', 'Günther', 'Brandt'],
    townPrefixes: ['Rosen', 'Wald', 'Stein', 'Berg', 'Kirch', 'Ober', 'Unter', 'Eisen', 'Mühl', 'Lin', 'Hohen', 'Neu', 'Alt', 'Tann', 'Dorn', 'Felden'],
    townSuffixes: ['heim', 'burg', 'hausen', 'stadt', 'feld', 'dorf', 'bach', 'au', 'berg', 'hagen', 'brück', 'tal'],
    towns: ['Grauwald', 'Eschenfurt', 'Niederkamm', 'Rabenstedt', 'Kesselbrunn', 'Holzmark'],
    clubPatterns: ['FC {T}', 'SV {T}', 'VfB {T}', 'TSV {T}', '1. FC {T}', 'Borussia {T}', 'SpVgg {T}', 'VfL {T}', 'Eintracht {T}', 'Fortuna {T}', 'SC {T}', 'Rot-Weiß {T}'],
    staffFirst: ['Otto', 'Udo', 'Felix', 'Ottmar', 'Jupp', 'Hennes', 'Willi', 'Ernst', 'Helmut', 'Dieter'],
  },
  FRA: {
    firstNames: ['Laurent', 'Thierry', 'Didier', 'Fabien', 'Sylvain', 'Christophe', 'Nicolas', 'Julien', 'Sébastien', 'Olivier', 'Pascal', 'Frédéric', 'Bixente', 'Yohan', 'Kévin', 'Mathieu', 'Romain', 'Antoine', 'Hugo', 'Lucas', 'Florent', 'Jérôme', 'Patrice', 'Vincent', 'Benoît', 'Karim', 'Samir', 'Moussa', 'Bakary', 'Lilian', 'Grégory', 'Rémi', 'Théo', 'Maxime'],
    lastNames: ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier', 'Morel', 'Girard', 'André', 'Mercier', 'Dupont', 'Lambert', 'Bonnet', 'François', 'Martinez', 'Legrand', 'Garnier', 'Faure', 'Rousseau', 'Blanc', 'Guerin', 'Muller', 'Henry', 'Roussel', 'Nicolas', 'Perrin', 'Diallo', 'Traoré', 'Koné'],
    townPrefixes: ['Saint', 'Mont', 'Ville', 'Beau', 'Clair', 'Belle', 'Val', 'Roche', 'Pont', 'Font', 'Château', 'Bois'],
    townSuffixes: ['fort', 'mont', 'ville', 'lieu', 'court', 'champ', 'mare', 'vert', 'fleur', 'roc', 'sur-Mer', 'les-Bains'],
    towns: ['Rivesaltes-Haut', 'Vaucluzan', 'Marbeuil', 'Granvillon', 'Lormaret', 'Coutelin'],
    clubPatterns: ['AS {T}', 'FC {T}', 'Olympique {T}', 'Stade {T}', 'RC {T}', 'SC {T}', 'US {T}', 'En Avant {T}', 'AJ {T}', 'Racing {T}', 'Girondins {T}', 'ES {T}'],
    staffFirst: ['Aimé', 'Guy', 'Raymond', 'Arsène', 'Gérard', 'Michel', 'Roger', 'Jean', 'Claude', 'Henri'],
  },
};

export const CLUB_COLORS: [string, string][] = [
  ['#c8102e', '#ffffff'], ['#003090', '#ffffff'], ['#1a1a1a', '#ffffff'], ['#ffd100', '#1a1a1a'],
  ['#00843d', '#ffffff'], ['#6cabdd', '#1c2c5b'], ['#7a263a', '#1bb1e7'], ['#ef7d00', '#000000'],
  ['#fdb913', '#231f20'], ['#0057b8', '#ffd700'], ['#8b0000', '#000000'], ['#ffffff', '#003399'],
  ['#5c2d91', '#ffffff'], ['#e30613', '#000000'], ['#009b3a', '#ffcc00'], ['#e4002b', '#0033a0'],
];
