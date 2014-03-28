$(document).ready(function() {

	//ACCORDION BUTTON ACTION (ON CLICK DO THE FOLLOWING)
	$(document).on('click', '.accordionButton', function() {
		$(this).toggleClass('on');
		if($(this).hasClass('on')){
			$(this).next().slideDown('normal');
			$(this).next().closest('input[type="text"]').focus();
		}
		

	 });
});
