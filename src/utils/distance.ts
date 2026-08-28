/**
 * Calcula a distância entre dois pontos em metros usando a fórmula de Haversine
 * @param lat1 Latitude do ponto 1
 * @param lon1 Longitude do ponto 1
 * @param lat2 Latitude do ponto 2
 * @param lon2 Longitude do ponto 2
 * @returns Distância em metros
 */
export function calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const R = 6371000; // Raio da Terra em metros
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // em metros
}

/**
 * Calcula o preço da corrida baseado na distância
 * @param distanceMetros Distância em metros
 * @returns Preço em reais (R$)
 */
export function calculatePrice(distanceMetros: number): number {
    // Tarifa: R$ 5,00 de bandeirada + R$ 2,50 por km
    const baseFare = 5.0;
    const perKm = 2.50;
    const km = distanceMetros / 1000;
    return Number((baseFare + perKm * km).toFixed(2));
}