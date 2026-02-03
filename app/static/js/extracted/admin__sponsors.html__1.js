document.addEventListener("DOMContentLoaded", function(){
        const searchInput = document.querySelector('input[name="q"]');
        const statusSelect = document.querySelector('select[name="status"]');
        const rows = document.querySelectorAll("tbody tr[data-sponsor]");

        function filterRows() {
          const term = searchInput.value.toLowerCase();
          const status = statusSelect.value;
          rows.forEach(row => {
            const name = row.dataset.name.toLowerCase();
            const email = row.dataset.email.toLowerCase();
            const rowStatus = row.dataset.status.toLowerCase();
            const matchText = (!term || name.includes(term) || email.includes(term));
            const matchStatus = (!status || rowStatus === status);
            row.style.display = (matchText && matchStatus) ? "" : "none";
          });
        }

        if (searchInput && statusSelect) {
          searchInput.addEventListener("input", filterRows);
          statusSelect.addEventListener("change", filterRows);
        }
      });
