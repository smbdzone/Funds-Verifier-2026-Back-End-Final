import axios from 'axios';

export async function GetUserLocalization(ip) {
    if (!ip) return null;
    try {
        const response = await axios.get(`https://ipapi.co/${ip}/json/`);
        const responseData = response?.data;
        return { city: responseData?.city || "", country: responseData?.country_name || "", region: responseData?.region || "" };
    } catch (error) {
        return { city: "", country: "", region: "" };
    }
};