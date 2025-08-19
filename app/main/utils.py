import math
from datetime import datetime

# --- Utility ---
def haversine(lat1, lon1, lat2, lon2):
    R = 6371000  # meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def latlng_to_tile(lat, lng, zoom):
    x = int((lng + 180) / 360 * (2 ** zoom))
    y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * (2 ** zoom))
    return x, y

def generate_tile_urls(min_lat, min_lng, max_lat, max_lng, zoom_levels, tile_url_template):
    tiles = set()

    for z in zoom_levels:
        x_min, y_max = latlng_to_tile(min_lat, min_lng, z)
        x_max, y_min = latlng_to_tile(max_lat, max_lng, z)

        for x in range(min(x_min, x_max), max(x_min, x_max) + 1):
            for y in range(min(y_min, y_max), max(y_min, y_max) + 1):
                tile_url = tile_url_template.format(z=z, x=x, y=y)
                tiles.add(tile_url)

    return sorted(tiles)




