window.addEventListener('online', function() {
  window.location.reload();
});

document.addEventListener('DOMContentLoaded', function() {
  var retryBtn = document.getElementById('btnRetryOffline');
  if (retryBtn) {
    retryBtn.addEventListener('click', function() {
      window.location.reload();
    });
  }
});
