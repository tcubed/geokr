function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
}



window.myUtils = window.myUtils || {};

window.myUtils.isOnWifi = function() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return null;
  if (connection.type) return connection.type === 'wifi';
  if (connection.effectiveType) return connection.effectiveType === '4g';
  return null;
};
