// src/config/matchMetadata.js

const footballInitialData = {
  players: 22,
  team1: [
    { p1: ["Alisson Becker", "https://example.com/photos/p1.png", 88] },
    { p2: ["Trent Alexander-Arnold", "https://example.com/photos/p2.png", 82] },
    { p3: ["Virgil van Dijk", "https://example.com/photos/p3.png", 91] },
    { p4: ["Ibrahima Konate", "https://example.com/photos/p4.png", 79] },
    { p5: ["Andrew Robertson", "https://example.com/photos/p5.png", 84] },
    { p6: ["Alexis Mac Allister", "https://example.com/photos/p6.png", 86] },
    { p7: ["Dominik Szoboszlai", "https://example.com/photos/p7.png", 80] },
    { p8: ["Curtis Jones", "https://example.com/photos/p8.png", 75] },
    { p9: ["Mohamed Salah", "https://example.com/photos/p9.png", 92] },
    { p10: ["Darwin Nunez", "https://example.com/photos/p10.png", 78] },
    { p11: ["Luis Diaz", "https://example.com/photos/p11.png", 83] }
  ],
  team_2: [
    { p12: ["Ederson", "https://example.com/photos/p12.png", 87] },
    { p13: ["Kyle Walker", "https://example.com/photos/p13.png", 81] },
    { p14: ["Ruben Dias", "https://example.com/photos/p14.png", 89] },
    { p15: ["Manuel Akanji", "https://example.com/photos/p15.png", 82] },
    { p16: ["Josko Gvardiol", "https://example.com/photos/p16.png", 85] },
    { p17: ["Rodri", "https://example.com/photos/p17.png", 94] },
    { p18: ["Kevin De Bruyne", "https://example.com/photos/p18.png", 93] },
    { p19: ["Bernardo Silva", "https://example.com/photos/p19.png", 88] },
    { p20: ["Phil Foden", "https://example.com/photos/p20.png", 89] },
    { p21: ["Jack Grealish", "https://example.com/photos/p21.png", 80] },
    { p22: ["Erling Haaland", "https://example.com/photos/p22.png", 95] }
  ]
};

const cricketInitialData = {
  players: 22,
  team1: [],
  team_2: []
};

module.exports = { footballInitialData, cricketInitialData };