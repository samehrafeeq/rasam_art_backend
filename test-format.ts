function formatPhone(to: string) {
  let formattedPhone = to.replace(/\D/g, '');
  if (formattedPhone.startsWith('05')) {
    formattedPhone = '9665' + formattedPhone.slice(2);
  } else if (formattedPhone.startsWith('5')) {
    formattedPhone = '9665' + formattedPhone.slice(1);
  }
  return formattedPhone;
}

console.log(formatPhone("0509756675"));
console.log(formatPhone("509756675"));
console.log(formatPhone("966509756675"));
console.log(formatPhone("+966509756675"));
