function processQuery(query) {
  const { minPrice, maxPrice, page, limit, ...restQuery } = query;
  const priceFilter = {};

  const parsedMin = parseFloat(minPrice);
  const parsedMax = parseFloat(maxPrice);

  if (minPrice !== undefined && maxPrice !== undefined) {
    priceFilter.price = { $gte: parsedMin, $lte: parsedMax };
  }
  // Combine price filter with remaining query (restQuery)
  const modifiedQuery = { ...restQuery, ...priceFilter };

  if (modifiedQuery.limit) delete modifiedQuery.limit;
  if (modifiedQuery.page) delete modifiedQuery.page;
  if (modifiedQuery.statusFilter) delete modifiedQuery.statusFilter;
  if (modifiedQuery.token) delete modifiedQuery.token;

  return modifiedQuery;
}

export default processQuery;
