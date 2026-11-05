// Twilio Voice SDK error codes → what the SDR should read. Pure.
// https://www.twilio.com/docs/api/errors

export function softphoneErrorMessage(code: number | undefined, fallback?: string): string {
    switch (code) {
        case 31401:
        case 31208:
            return "Accès au micro refusé : autorisez le micro pour ce site dans le navigateur.";
        case 31402:
            return "Aucun micro détecté. Branchez un casque puis réessayez.";
        case 20101:
        case 20104:
        case 31204:
        case 31205:
            return "Session téléphonique expirée. Réessayez l'appel.";
        case 31005:
        case 31009:
        case 53000:
        case 53405:
            return "Connexion à la téléphonie perdue. Vérifiez votre réseau.";
        case 31486:
            return "Le correspondant est occupé.";
        case 31480:
            return "Correspondant injoignable pour le moment.";
        case 31603:
            return "Appel refusé par le correspondant.";
        default:
            return fallback?.trim() ? `Appel interrompu (${fallback.trim()})` : "Appel interrompu.";
    }
}
