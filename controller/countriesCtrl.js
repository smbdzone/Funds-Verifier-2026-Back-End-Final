import { CountriesData } from "../data/Countries.js";

export const GetAllCountriesData = async (req, res) => {
    try {
        const code = req.query.code;
        const name = req.query.name;

        const allCountriesWithFlags = CountriesData?.map((country) => {
            return {
                ...country,
                flag: country?.code
                    ? `https://flagcdn.com/${country.code.toLowerCase()}.svg`
                    : "",
            };
        });

        let result = allCountriesWithFlags;

        if (code) {
            const country = allCountriesWithFlags.find((c) => c.code?.toLowerCase() === code.toLowerCase());
            if (!country) return res.status(404).json({ message: "Country with given code not found", countries: [] });

            return res.status(200).json({ countries: [country] });
        }

        if (name) {
            result = allCountriesWithFlags.filter((c) => c.name?.toLowerCase().includes(name.toLowerCase()));
        }

        return res.status(200).json({ total: result?.length || 0, countries: result });
    } catch (error) {
        res.status(500).json({ message: "Error fetching countries", error });
    }
};