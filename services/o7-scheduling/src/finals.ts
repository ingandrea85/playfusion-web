// The pure finals generators + their draw types now live in the shared @playfusion/finals-format lib
// (used by o7 generate AND the E1/E3 live formula preview). Re-export them so existing o7 imports
// (`buildFinals`, `bracketFromParticipants`, `FinalDraw`, `FinalGroupInput`, `FinalsType`) keep working.
export * from '@playfusion/finals-format';
