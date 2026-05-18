export function AssetsListingsPricing({ type, listing, price }) {
    try {
        const thresholds = { property: 5000000, car: 350000, boat: 1000000, jewelry: 100000 };
        const normalizedType = type?.toLowerCase();

        if (normalizedType in thresholds) {
            if (price > thresholds[normalizedType]) {
                return listing;
            } else {
                return "Public";
            }
        }
        return listing || "Public";
    } catch (error) {
        return "Public";
    }
}
